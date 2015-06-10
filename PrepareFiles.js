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
var eventemitter, sfproperties, conn, listQuerySplit, completedItems, developerGroupingMap={}, packageGroupingMap={} ,sandboxname ,sandboxdata={} , useoauth=true;
var today = new Date();
var ignoreThesetypes=['roles','dashboard','emailtemplates','report'];

function loadProperties() {
  console.log('loading property information from build.properties file');
  properties.parse('build.properties', { path : true }, function (error, obj) {
    if (error) {
      return console.error(error);
    }
    // console.log(obj);
    sfproperties = obj;
    fs.readFile('../sandboxinfo.json','utf8',function(err,data){
        if(err) console.error(err);
        sandboxdata=JSON.parse(data);
        eventemitter.emit('loadedproperties');
    });
    
   });   
}

function connectToSalesforce(){
    console.log('connecting to salesforce');
    process.argv.forEach(function (val, index, array) {
    if(index==2)
    {
      sandboxname=val.toLowerCase(); 
      if(_.has(sandboxdata,sandboxname))
      {
        sfproperties.sfusername=sandboxdata[sandboxname].username;
        sfproperties.sfpassword=sandboxdata[sandboxname].password;
        sfproperties.sfserverurl=sandboxdata[sandboxname].loginurl;
        console.log(sandboxdata[sandboxname].initialsetupdone);
        if(sandboxdata[sandboxname].initialsetupdone){
            sfproperties.sfrecentdecidermode=sandboxdata[sandboxname].trackingmode;
            sfproperties.sfrecentdecider=sandboxdata[sandboxname].trackingtime;
        }
        else{
           sfproperties.sfrecentdecidermode='days';
           sfproperties.sfrecentdecider=Math.ceil((new Date()-new Date(sandboxdata[sandboxname].refresheddate))/(1000*3600*24));
           console.log(sfproperties.sfrecentdecider);
        }
      } 
    }
    });

    var oauthparams = {    
        loginUrl : sfproperties.sfserverurl,
        clientId: '3MVG99qusVZJwhsngoZ2VL_GF1pAQ83UKhhGTrOtMPPHIP8s9A7SZPVQZtiq6hO7asSqmTgXzKFmSvpCJ5wYb',
        clientSecret: '8802715781625351810',
        redirectUri: 'https://login.salesforce.com/services/oauth2/callback',
    }
    if(useoauth){
        console.log('using oauth');
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
        if(err){
            console.error(err);
            eventemitter.emit('connectionfailed');
        }
        else{
        organizationId=userInfo.organizationId;
        console.log('connected to '+sandboxname+ ' as '+ sfproperties.sfusername);
        eventemitter.emit('connected');
        }
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
            if(sfproperties.sfrecentdecidermode == 'hours')
            {
                if(_timeDiffInHours(listResult.lastModifiedDate) <= sfproperties.sfrecentdecider)
                {
                    if(_.indexOf(ignoreThesetypes,listResult.type.toLowerCase()==-1){
                    _checkAndAddtoObject(developerGroupingMap,listResult.lastModifiedByName,listResult.fileName);
                    _checkAndAddtoObject(packageGroupingMap,listResult.type,listResult.fullName);
                    }
                }
            }
            else if(sfproperties.sfrecentdecidermode == 'days')
            {
                if(_dateDiffInDays(listResult.lastModifiedDate) <= sfproperties.sfrecentdecider)
                {
                    if(_.indexOf(ignoreThesetypes,listResult.type.toLowerCase()==-1){
                    _checkAndAddtoObject(developerGroupingMap,listResult.lastModifiedByName,listResult.fileName);
                    _checkAndAddtoObject(packageGroupingMap,listResult.type,listResult.fullName);
                    }
                }
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
        if(componenttype)
        packagexmlstring+='\n<types>';
        _.each(_.uniq(packageGroupingMap[componenttype]),function(member){
            packagexmlstring+='\n<members>'+member+'</members>';
        });
        packagexmlstring+='\n<name>'+componenttype+'</name>';
        packagexmlstring+='\n</types>';
    });
    packagexmlstring+='\n<version>32.0</version>';
    packagexmlstring+='\n</Package>';
    fs.writeFile(sandboxname+'_package.xml',packagexmlstring,function(err){
        if(err) console.error(err);
        console.log(' ok am done writing the package xml for '+sandboxname);
    })
}

function prepareDeveloperScriptFile(){
    console.log('preparing the developer script file');
    var gitprefix='git --git-dir="../../boxes/'+sandboxname+'/.git" --work-tree="../../boxes/'+sandboxname+'"';
    var scriptfilestring=gitprefix+' checkout -b '+(sandboxname!=null ? sandboxname : organizationId )+ '\n';
    _.each(_.keys(developerGroupingMap),function(developername){
        var addarray=[];
        _.each(_.uniq(developerGroupingMap[developername]),function(content){
                addarray.push('"'+content+'" "'+content+'-meta.xml'+'"');
        });
        _.each(_splitArrayBySize(addarray,3000),function(customlist){
            scriptfilestring+= gitprefix+' add '+customlist.join(' ')+'\n'; 
        });
        scriptfilestring+= gitprefix+' commit --author="'+developername+'<'+developername+'@schneider-electric.com>" -m "'+developername+' s commit"\n';
    });
    scriptfilestring+=gitprefix+' add .\n';
    scriptfilestring+=gitprefix+' commit --author="gitInterfaceUser<gitinterfaceuser@gmail.com>" -m "commiting remaining files"\n';
    scriptfilestring+=gitprefix+' push -u origin '+(sandboxname!=null ? sandboxname : organizationId );
    fs.writeFile(sandboxname+'_gitcommands.sh',scriptfilestring,function(err){
        if(err) console.error(err);
        console.log('prepared developer script file');
    })
}

function failedconnection(){
    console.log('no idea what happened but connection is failed and you gotta do something');
}

function loadEventEmitterMappings(){ 
    eventemitter = new events.EventEmitter();   
    eventemitter.on('loadedproperties',connectToSalesforce);
    eventemitter.on('connectionfailed',failedconnection);
    eventemitter.on('connected',loadMetaObjects);
    eventemitter.on('listQueryPrepared',loadListQueries);
    eventemitter.on('completedcalculations',saveToFiles);
}


function start(){
    loadEventEmitterMappings();
    loadProperties();
}

start();