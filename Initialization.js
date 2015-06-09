//require modules
var Firebase=require('firebase');
var fs=require('fs');
var _=require('underscore');
var events=require('events');

var firebasesecret,firebaseref,eventemitter;


function authHandler(error, authData) {
if (error) {
  console.error(error);
  eventemitter.emit("firebaseloginfailed");
} else {
  eventemitter.emit("firebaseloginsuccess");	
}
}

function login(){
	firebaseref.authWithCustomToken("VQ2DOMz32MTKL6S2STxGOSJ3inJ3URpwMmfe6ep1", authHandler);
}

function downloaddata(){
	firebaseref.child('environments').on('value',function(sid){
		fs.writeFile('sandboxinfo.json',JSON.stringify(sid.val(),null,4),function(err){
			if(err) console.error(err);
			scripts='';
			data=sid.val();
			_.each(_.keys(data),function(environment){
				antfile='<project name="bfotracker" default="start" basedir="." xmlns:sf="antlib:com.salesforce">\n';
				scripts+='mkdir ../../boxes/'+environment+'\n';
				scripts+='git clone https://sesa206167@bitbucket.org/sesa206167/testbfo.git ../../boxes/'+environment+'\n';
				scripts+='git --git-dir=../../boxes/'+environment+'/.git --work-tree=../../boxes/'+environment+' checkout -b '+environment+'\n';
				antfile+='<target name="prepareFiles">\n<exec executable="node"><arg value="../prepareFiles.js"/>\n<arg value="'+environment+'"/>\n</exec>\n</target>\n<target name="retrieve" description="retrieve">\n<sf:retrieve maxPoll="10000" password="'+data[environment].password+'" retrieveTarget="../../boxes/'+environment+'" serverurl="'+data[environment].loginurl+'" unpackaged="'+environment+'_package.xml" username="'+data[environment].username+'" trace="false"/>\n</target>\n<target name="runshellcommands" description="runshellcommands">\n<exec executable="sh">\n<arg value="'+environment+'_gitcommands.sh" />\n</exec>\n</target>\n<target name="start" depends="prepareFiles, retrieve ,runshellcommands" />\n</project>';
				fs.writeFile('genfiles/'+environment+'.xml',antfile,function(err){if(err) console.error(err)});
			});
			fs.writeFile('genfiles/initializationscripts.sh',scripts,function(err){
				if(err) console.error(err);				
				process.exit();
			});
		});
	});
}

function displaymessage(){
	console.log('you should check with firebase login creds may be the token expired');
}

function prepareevents(){
	eventemitter = new events.EventEmitter();
	eventemitter.on('firebaseloginsuccess',downloaddata);
	eventemitter.on('firebaseloginfailed',displaymessage);
}

function start(){

	//loading defaults
	firebasesecret='VQ2DOMz32MTKL6S2STxGOSJ3inJ3URpwMmfe6ep1';
	firebaseref=new Firebase('https://bfotracker.firebaseio.com/');
	prepareevents();
	login();
}

start();	

