/*
* Author : Sidharth Nagavarapu
* Purpose : To prepare the list of changes
*/
// all the modules I need
var properties = require('properties');
var jsforce = require('jsforce');
var events = require('events');
var _ = require('underscore');
var fs = require('fs');


// variables required as global
var eventemitter, sfproperties, conn, listQuerySplit, completedItems, developerGroupingMap={}, packageGroupingMap={};
var today = new Date();
var recentItemsDecider_indays = 2000;

function loadProperties() {
  console.log('loading property information from build.properties file');
  properties.parse('build.properties', { path : true }, function (error, obj) {
    if (error) {
      return console.error(error);
    }
    console.log(obj.sfusername);
    sfproperties = obj;
    eventemitter.emit('loadedproperties');
   });   
}

function connectToSalesforce(){
    console.log('connecting to salesforce');
    var oauthparams = {    
        loginUrl : sfproperties.serverurl,
        clientId : sfproperties.clientId,
        clientSecret : sfproperties.sfclientSecret,
        redirectUri :  sfproperties.sfredirectUri
    }
    if(sfproperties.useoauth){
        conn=new jsforce.Connection({
            oauth2 : oauthparams
        });    
    }
    else
    {
        conn=new jsforce.Connection({
            loginUrl : sfproperties.serverurl
        });
    }
    conn.login(sfproperties.sfusername,sfproperties.sfpassword,function(err,userInfo){
        if(err) console.error(err);
        console.log(userInfo);
        eventemitter.emit('connected');
    });
}

function loadMetaObjects(){
    console.log('getting metadata describe information');
    conn.metadata.describe().then(function (describeResult) { 
        listQueryInfo = [];     
        _.each(describeResult.metadataObjects,function(metadataObject){
            if(!_.isUndefined(metadataObject.xmlName))
            listQueryInfo.push({type:metadataObject.xmlName});
            if(_.has(metadataObject,'childXmlNames')){
                _.each(metadataObject.childXmlNames,function(childmetadataObject){
                    if(!_.isUndefined(childmetadataObject.xmlName))
                    listQueryInfo.push({type:childmetadataObject.xmlName});
                });
            }
        });
        //to split the elements into size of 3 , list limit in salesforce
        listQuerySplit=_splitArrayBySize(listQueryInfo,3);
        eventemitter.emit('listQueryPrepared');
    });
}

function loadListQueries(){
    console.log('started list queries ... this might take a while as it has ' + listQuerySplit.length + 'iterations ');
    completedItems=0;
    _.each(listQuerySplit,function(listqueryparameter){
        setTimeout(runSmallListQueries(listqueryparameter),100);
    });
}

function runSmallListQueries(listqueryparameter){
    conn.metadata.list(listqueryparameter).then(function(listqueryResult){
        _.each(listqueryResult,function(listResult){
            if(_dateDiffInDays(listResult.lastModifiedDate) <= recentItemsDecider_indays)
            {
                _checkAndAddtoObject(developerGroupingMap,listResult.lastModifiedByName,listResult.fileName);
                _checkAndAddtoObject(packageGroupingMap,listResult.type,listResult.fullName);
            }
        });
        completedItems++;

        if(completedItems==listQuerySplit.length)
        eventemitter.emit('completedcalculations');        
    });
}


function _checkAndAddtoObject(_mapObject,key,value){
    if(_.has(_mapObject,key)){
        if(JSON.stringify(_mapObject[key])!=JSON.stringify(value))
        _mapObject[key].push(value);
    }
    else{
        _mapObject[key]=[value];
    }
}


function _splitArrayBySize(_arraytoSplit,_lengthofarray){
    _splittedArray=[];
    for(counter=0;counter<_arraytoSplit.length;counter=counter+3)
        _splittedArray.push(_arraytoSplit.slice(counter,counter+3));
    return _splittedArray;
}

function _dateDiffInDays(datestr)
{
    return _timeDiffInHours(datestr)/24;
}

function _timeDiffInHours(datestr)
{
    var recordDate=new Date(datestr); 
    var diffDays = Math.ceil(Math.abs(today.getTime() - recordDate.getTime()) / (1000 * 3600));
    return diffDays;
}

function saveToFiles(){
    console.log('i will start writing to files');
    preparePackageXMLFile();
    prepareDeveloperScriptFile();
}

function preparePackageXMLFile(){
    console.log('preparing package xml file as you love it so much');
    var packagexmlstring='<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">';
    _.each(_.keys(packageGroupingMap),function(componenttype){
        packagexmlstring+='\n<types>';
        _.each(_.uniq(packageGroupingMap[componenttype]),function(member){
            packagexmlstring+='\n<members>'+member+'</members>';
        });
        packagexmlstring+='\n<name>'+componenttype+'</name>';
        packagexmlstring+='\n</types>';
    });
    packagexmlstring+='\n<version>32.0</version>';
    packagexmlstring+='\n</Package>';
    fs.writeFile('package.xml',packagexmlstring,function(err){
        if(err) console.error(err);
        console.log(' ok am done writing the package xml');
    })
}

function prepareDeveloperScriptFile(){
    console.log('preparing the developer script file');
    var gitprefix='git --git-dir="../sidretrieve/.git" --work-tree="../sidretrieve"';
    var scriptfilestring=gitprefix+' init \n';
    scriptfilestring+=gitprefix+' commit -m "initial commit" \n';
    _.each(_.keys(developerGroupingMap),function(developername){
        _.each(_splitArrayBySize(_.uniq(developerGroupingMap[developername]),500),function(splittedarray){
                scriptfilestring+= gitprefix+' add "'+ splittedarray.join('" "') +'"\n';
        });
        
        scriptfilestring+= gitprefix+' commit --author="'+developername+'<'+developername+'@schneider-electric.com>" -m "'+developername+' s commit"\n';
    });
    fs.writeFile('gitcommands.sh',scriptfilestring,function(err){
        if(err) console.error(err);
        console.log('prepared developer script file');
    })
}

function loadEventEmitterMappings(){ 
    eventemitter = new events.EventEmitter();   
    eventemitter.on('loadedproperties',connectToSalesforce);
    eventemitter.on('connected',loadMetaObjects);
    eventemitter.on('listQueryPrepared',loadListQueries);
    eventemitter.on('completedcalculations',saveToFiles);
}

function start(){
    loadEventEmitterMappings();
    loadProperties();
}

start();