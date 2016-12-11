#!/usr/bin/env node
var chalk = require('chalk');
var clear = require('clear');
var CLI = require('clui');
var figlet = require('figlet');
var inquirer = require('inquirer');
var Preferences = require('preferences');
var Spinner = CLI.Spinner;
var _ = require('lodash');
var git = require('simple-git')();
var touch = require('touch');
var fs = require('fs');
var request = require('request');
var files = require('./lib/files');
var https = require('https');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

hostpref = new Preferences('autolab.host');
if (!hostpref.host) {
	hostpref.host = {
		host: 'https://autolab.bits-goa.ac.in',
	}
}

function init(callback) {
	prefs = new Preferences('in.ac.bits-goa.autolab');
	console.log('Working on host ' + hostpref.host.host)
	console.log(
		chalk.yellow(
			figlet.textSync('Autolab', { horizontalLayout: 'full' })
			)
		);

	var questions = [
	{
		name: 'username',
		type: 'input',
		message: 'Enter your Gitlab username or email address:',
		validate: function(value) {
			if (value.length) {
				return true;
			}
			else {
				return 'Please enter your Gitlab username or e-mail address';
			}
		}
	},
	{
		name: 'password',
		type: 'password',
		message: 'Enter your password:',
		validate: function(value) {
			if (value.length) {
				return true;
			}
			else {
				return 'Please enter your password';
			}
		}
	}
	];
	
	if (prefs.gitlab && Math.floor(Date.now() / 1000) - prefs.gitlab.time < 7200 && Math.floor(Date.now() / 1000) - prefs.gitlab.time > 0 ) {
		timeLeft = 120 - ((Math.floor(prefs.gitlab.time < 7200 && Math.floor(Date.now() / 1000) - prefs.gitlab.time)/60));
		console.log(chalk.blue("You are already authenticated. If this is not you, or you want to exit the session, use 'autolab exit'. Session will expire in " + timeLeft + ' minutes'));
	} else {
		inquirer.prompt(questions).then(function(answers) {
			var status = new Spinner('Authenticating you, please wait ...');
			pass = arguments['0']['password'];
			status.start()
			request.post(
				hostpref.host.host +'/api/v3/session?login=' + arguments['0']['username'] + '&password=' + arguments['0']['password'],
				function (error, response, body) {
					status.stop()
					token = JSON.parse(body)['private_token'];
					if (!token ) {
						console.log(chalk.red('Invalid Username or Password'))
						init();
					} else {
						prefs.gitlab = {
							name: JSON.parse(body)['name'].split(' ')[0],
							username: JSON.parse(body)['username'],
							password: pass,
							token: token,
							time: Math.floor(Date.now() / 1000)
						};
						console.log(chalk.green('Successfully authenticated!'));
						if (!('.git' in _.without(fs.readdirSync('.')))) {
							git.init();
						}
						console.log(chalk.white('Hi ' + JSON.parse(body)['name'].split(' ')[0] + ", proceed to making commits in this repository. See 'autolab --help' for help."));
						console.log(chalk.blue("Your session will be active for the next two hours. Use 'autolab exit' to exit the session."));
					}
				});
		});
	} 
}

function changeHost() {
	var hostname = [
	{
		name: 'host',
		type: 'input',
		message: 'Host name: ',
		default: hostpref.host.host,

	}]

	inquirer.prompt(hostname).then(function(answers) {
		hostpref.host = {
			host: arguments['0']['host'],
		}
	})

}

function createRepo(callback) {
	var questions = [
	{
		name: 'lab',
		type: 'input',
		message: 'Enter the Lab Name to be created',
		validate: function(value) {
			if (value.length) {
				return true;
			}
			else {
				return 'Please enter the Lab No.';
			}
		}
	}];
	inquirer.prompt(questions).then(function (answers) {
		var prefs = new Preferences('in.ac.bits-goa.autolab');
		var labno = arguments['0']['lab'];
		request.post(
			hostpref.host.host +'/api/v3/projects?private_token=' + prefs.gitlab.token,
			{ json: {'name' : labno}},
			function (error, response, body) {
				if (error) {
					console.log(error);
					return;
				}
				if (response.statusCode == 201) {
					console.log(chalk.green('Successfully created online repo ' + labno));
					git.addRemote('autolab', (hostpref.host.host.search(/https:\/\//)? 'http://' : 'https://') + prefs.gitlab.username.replace(/@/g, '%40') + ':' + prefs.gitlab.password.replace(/@/g, '%40') + '@' + hostpref.host.host.replace(/^https?\:\/\//i, "") +'/' + prefs.gitlab.username + '/' + labno);
				}
				if (response.statusCode == 401 || response.statusCode == 403 ) {
					console.log(chalk.red("Authentication problem!. Use 'autolab init' to authenticate." ))
				}
				if (response.statusCode == 400) {
					console.log(chalk.yellow("Already created " + labno))
				}
				console.log(response.statusCode);
			});
	});
}

function deleteRepo(callback) {
	var questions = [
	{
		name: 'lab',
		type: 'input',
		message: 'Enter the Lab No. to be deleted',
		validate: function(value) {
			if (value.length) {
				return true;
			}
			else {
				return 'Please enter the Lab No.';
			}
		}
	}];
	inquirer.prompt(questions).then(function (answers) {
		var prefs = new Preferences('in.ac.bits-goa.autolab');
		var labno = arguments['0']['lab'];
		request.delete(
			hostpref.host.host +'/api/v3/projects/' + prefs.gitlab.username + '%2F' +labno +'?private_token=' + prefs.gitlab.token,
			function (error, response, body) {
				if (response.statusCode == 200) {
					console.log(chalk.green('Successfully deleted' + labno));
				}
				if (response.statusCode == 401 || response.statusCode == 403 ) {
					console.log(chalk.red("Authentication problem!. Use 'autolab init' to authenticate." ))
				}
				if (response.statusCode == 400) {
					console.log(chalk.yellow("No online repo with the name " + labno))
				}
		});
	});
}

function push() {
	var questions = [
	{
		name: 'message',
		type: 'input',
		message: 'Enter the commit message',
		validate: function(value) {
			if (value.length) {
				return true;
			}
			else {
				return 'Please enter commit message';
			}
		}
	}];

	inquirer.prompt(questions).then(function (answers) {
		var status = new Spinner('Pushing the code');
		status.start();
		git.add('./*').commit(arguments[0]['message']).push('autolab', 'master');
		status.stop();
	});
}

var argv = require('minimist')(process.argv.slice(2));

if (argv._[0] == 'init') {
	init();
} else if (argv._[0] == 'git') {
	if (argv._[1] == 'create') {
		createRepo();
	}
	if (argv._[1] == 'delete') {
		deleteRepo();
	}
	if (argv._[1] == 'changeserver') {
		changeHost();
	}
} else if (argv._[0] == 'push') {
	push();
}else if (argv._[0] == 'exit'){
	var prefs = new Preferences('in.ac.bits-goa.autolab');
	prefs.gitlab = {
		token: '',
		time: 0
	};
	console.log('Successfully exited!');

}