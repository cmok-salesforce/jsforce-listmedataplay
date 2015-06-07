//Salesforce Parameters
var sfusername='siddharatha.n@tcs.com';//'sesa206167@bridge-fo.com.uatapr';
var sfpassword='jan@20158rOwbskGEnVWw7xFCM18TAmy';
var loginEndpoint='https://login.salesforce.com';
var useoauth=false;
var oauthparams = {    
    loginUrl : loginEndpoint,
    clientId : '3MVG99qusVZJwhsngoZ2VL_GF1pAQ83UKhhGTrOtMPPHIP8s9A7SZPVQZtiq6hO7asSqmTgXzKFmSvpCJ5wYb',
    clientSecret : '8802715781625351810',
    redirectUri : 'https://login.salesforce.com/services/oauth2/callback'
  }

//request for updates in days starting backwards from current date.
var starttime=new Date();
var recent_decider=100;
var developerCompGroup={};
var jsforce=require('jsforce');
var fs=require('fs');
var _ = require('underscore');
var unzip=require('unzip');
// var package={"types":[{"members":["MyFate3","VFP_AngularBootstrapTemplate"],"name":"ApexPage"},{"members":"JSONUtils","name":"ApexClass"}],"version":"30.0"}
var pacakgexmlstuff={"version":"30.0","types":[]}
var packages={}
var conn=undefined;
if(useoauth){
    conn=new jsforce.Connection({
    oauth2 : oauthparams
});    
}
else
{
conn=new jsforce.Connection({
    loginUrl : 'https://test.salesforce.com'
});
}
var ProgressBar = require('progress');
conn.login(sfusername,sfpassword,function(err,userInfo){
if(err){console.log(err)}
     console.log('you are connected to ');
     console.log(userInfo);

     conn.metadata.describe().then(function(res){
        var metaobjects=res.metadataObjects;
        var lstmetaquery=[];
        var startTime=new Date();
        var initialcount=Math.ceil(metaobjects.length/3);
        var completedcount=initialcount;
        var bar = new ProgressBar('  Processing [:bar] :percent :etas', {
            complete: '='
          , incomplete: ' '
          , width: 80
          , total: initialcount
        });

        for(var i=0;i<metaobjects.length;i++)
        {
            lstmetaquery.push({type:metaobjects[i].xmlName});
            if(metaobjects[i].hasOwnProperty('childXmlNames') && metaobjects[i].childXmlNames.hasOwnProperty('length'))
            {
                var childnames=metaobjects[i].childXmlNames;
               for(var j=0;j<childnames.length;j++)
                lstmetaquery.push({type:childnames[j]});
            }
        }
        lstmetaquery.sort();
        for(var i=0;i<lstmetaquery.length;i=i+3)
        {            
            var newlist=lstmetaquery.slice(i,i+3);
            setTimeout(getlists(newlist,i),100);
        }

        function getlists(listquery,counter){           
            conn.metadata.list(newlist).then(function(result){            
                if(result!=undefined && result.hasOwnProperty('length')){
                    var completeinfostr='';
                    var recentdaysstr='';
                    for(var j=0;j<result.length;j++){                        
                        diffdays=getDiff(result[j].lastModifiedDate);
                        if(diffdays<=recent_decider){
                            if(_.has(developerCompGroup,result[j].lastModifiedByName))
                            {
                                developerCompGroup[result[j].lastModifiedByName].push({
                                    type : result[j].type,
                                    component : result[j].fullName,
                                    manageableState : result[j].manageableState,
                                });
                            }
                            else
                            {
                                developerCompGroup[result[j].lastModifiedByName]=
                                [{
                                    type : result[j].type,
                                    component : result[j].fullName,
                                    manageableState : result[j].manageableState
                                }];
                            }

                            if(_.has(packages,result[j].type)){
                                packages[result[j].type].push(result[j].fullName);
                            }
                            else
                            {
                                packages[result[j].type]=[result[j].fullName];
                            }
                        }                        
                    }
                }
                completedcount--;
                bar.tick(initialcount-completedcount);
                if(completedcount==0){
                fs.writeFile('developergrouping.json',JSON.stringify(developerCompGroup),function(err){
                    preparePackageXML();
                });
                }    
            });
        }

        function preparePackageXML(){
            _.each(_.keys(packages),function(eachkey){
                pacakgexmlstuff.types.push({"members":packages[eachkey].join(','),"name":eachkey});
            });
            fs.writeFile('packagegrouping.json',JSON.stringify(pacakgexmlstuff),function(err){
            });
            /* conn.metadata.retrieve({unpackaged:pacakgexmlstuff}).stream().pipe(fs.createWriteStream("sidharth.zip",function(err){
                console.log(((new Date()-starttime)/1000) + ' seconds ');
                console.log('finished ......');
            }));*/
        }

        function getDiff(datestr)
        {
            var currentDate=new Date();
            var recordDate=new Date(datestr);
            var timeDiff = Math.abs(currentDate.getTime() - recordDate.getTime());
            var diffDays = Math.ceil(timeDiff / (1000 * 3600));
            return diffDays;
        }

    });
});
