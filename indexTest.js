'use strict'
var config = require('config');
var jsforce = require('jsforce');
var Octokit = require('@octokit/rest');

var OWNER = config.get('GIT_OWNER');
var REPO = config.get('GIT_REPO');


var conn = new jsforce.Connection({
    loginUrl : config.get('SF_URL')
});

var octokit = new Octokit({
    auth : config.get('GIT_TOKEN')
});

var _connectToSalesforce = function () {
    return new Promise(function (resolve, reject) {
        conn.login(config.get('SF_USERNAME'), config.get('SF_PASSWORD'), function (error, userInfo) {
            if (error) {
                reject(error);
            } else {
                console.log(JSON.stringify(userInfo));
                resolve();
            }
        });
    });
}

var _getApexClasses = function(latestCommonCommitDate) {
    return _getLastCommit('src/classes').then(function (lastPathCommitResp) {
        return new Promise(function (resolve, reject) {
            var sfFiles = {};
            conn.query('select Id, Name, Body, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Email ' +
                'from ApexClass where NamespacePrefix = null and LastModifiedDate >= ' +  _getLastCommitDate(latestCommonCommitDate, lastPathCommitResp))
                .on('record', function (record) {
                    var email = record.LastModifiedBy.Email;
                    if (sfFiles[email] === undefined) {
                        sfFiles[email] = {
                            committer: {
                                name: record.LastModifiedBy.Name,
                                email: email
                            },
                            contents: []
                        }
                    }
                    sfFiles[email].contents.push({
                        content: record.Body,
                        path: _getPath(record),
                        mode: '100644',
                        type: 'blob'
                    });
                }).on('error', function (err) {
                    console.error(err);
                    reject(error);
            }).on('end', function () {
                resolve(sfFiles);
            }).run({autoFetch: true});
        });
    });
}

var _getApexTriggers = function(latestCommonCommitDate) {
    return _getLastCommit('src/triggers').then(function (lastPathCommitResp) {
        return new Promise(function (resolve, reject) {
            var sfFiles = {};
            conn.query('select Id, Name, Body, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Email ' +
                'from ApexTrigger where NamespacePrefix = null and LastModifiedDate >= ' +  _getLastCommitDate(latestCommonCommitDate, lastPathCommitResp))
                .on('record', function (record) {
                    var email = record.LastModifiedBy.Email;
                    if (sfFiles[email] === undefined) {
                        sfFiles[email] = {
                            committer: {
                                name: record.LastModifiedBy.Name,
                                email: email
                            },
                            contents: []
                        }
                    }
                    sfFiles[email].contents.push({
                        content: record.Body,
                        path: _getPath(record),
                        mode: '100644',
                        type: 'blob'
                    });
                }).on('error', function (err) {
                console.error(err);
                reject(error);
            }).on('end', function () {
                resolve(sfFiles);
            }).run({autoFetch: true});
        });
    });
}

var _getLastCommitDate = function (latestCommonCommitDate, lastPathCommitResp) {
    var lastCommitDate = (new Date(1970, 1)).toISOString();
    return lastPathCommitResp.data.length == 0 ? lastCommitDate : latestCommonCommitDate;
}

var _getApexPages = function (latestCommonCommitDate) {
    return _getLastCommit('src/pages').then(function (lastPathCommitResp) {
        return new Promise(function (resolve, reject) {
            var sfFiles = {};
            conn.query('select Id, Name, Markup, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Email ' +
                'from ApexPage where NamespacePrefix = null and LastModifiedDate >= ' + _getLastCommitDate(latestCommonCommitDate, lastPathCommitResp))
                .on('record', function (record) {
                    var email = record.LastModifiedBy.Email;
                    if (sfFiles[email] === undefined) {
                        sfFiles[email] = {
                            committer: {
                                name: record.LastModifiedBy.Name,
                                email: email
                            },
                            contents: []
                        }
                    }
                    sfFiles[email].contents.push({
                        content: record.Markup,
                        path: _getPath(record),
                        mode: '100644',
                        type: 'blob'
                    });
                }).on('error', function (err) {
                console.error(err);
                reject(error);
            }).on('end', function () {
                resolve(sfFiles);
            }).run({autoFetch: true});
        });
    });
}

var _getAuraFiles = function(latestCommonCommitDate) {
    return _getLastCommit('src/aura').then(function (lastPathCommitResp) {
        return new Promise(function (resolve, reject) {
            var sfFiles = {};
            conn.query('select Id, Source, DefType, AuraDefinitionBundle.DeveloperName, LastModifiedDate, LastModifiedBy.Name, LastModifiedBy.Email ' +
                'from AuraDefinition where AuraDefinitionBundle.NamespacePrefix = null and LastModifiedDate >= ' + _getLastCommitDate(latestCommonCommitDate, lastPathCommitResp))
                .on('record', function (record) {
                    var email = record.LastModifiedBy.Email;
                    if (sfFiles[email] === undefined) {
                        sfFiles[email] = {
                            committer: {
                                name: record.LastModifiedBy.Name,
                                email: email
                            },
                            contents: []
                        }
                    }
                    sfFiles[email].contents.push({
                        content: record.Source,
                        path: _getPath(record),
                        mode: '100644',
                        type: 'blob'
                    });
                }).on('error', function (err) {
                console.error(err);
                reject(error);
            }).on('end', function () {
                resolve(sfFiles);
            }).run({autoFetch: true});
        });
    });
}

var _getSalesforceFiles = function () {
    return new Promise(function (resolve, reject) {
        console.log('right before get last commit');
        return _getLastCommit().then(function (lastCommitResp) {
            const latestCommitDate = lastCommitResp.data[0].commit.author.date;

            return Promise.all([_getApexClasses(latestCommitDate), _getAuraFiles(latestCommitDate),
                    _getApexPages(latestCommitDate), _getApexTriggers(latestCommitDate)])
                .then(function (sfFiles) {
                    var sfFilesTmp = {};
                    for (var i in sfFiles) {
                        for (var key in sfFiles[i]) {
                            if (sfFilesTmp[key] === undefined) {
                                sfFilesTmp[key] = sfFiles[i][key];
                            } else {
                                sfFilesTmp[key].contents = sfFilesTmp[key].contents.concat(sfFiles[i][key].contents);
                            }
                        }
                    }

                    var sfFilesArray = [];
                    for (var key in sfFilesTmp) {
                        sfFilesArray.push(sfFilesTmp[key]);
                    }

                    resolve(sfFilesArray)
                }).catch(function (error) {
                    console.error(error);
                    reject(error);
                })
        })
    })
}


var _getLastCommit = function (path) {
    console.log('here in _getLastCommit');
    return octokit.repos.listCommits({
        owner : OWNER, repo : REPO, per_page : 1, path : path === undefined ? '/' : path
    })
}

var _getLastCommit2 = function (path) {
    console.log('here in _getLastCommit');
    return octokit.repos
}

var _createNewTree = function (treeContent, latestCommitSha) {

    return octokit.git.createTree({
        repo: REPO,
        owner : OWNER,
        base_tree : latestCommitSha,
        tree : treeContent
    });
}

var _createCommit = function (newTreeSha, latestCommitSha, committer) {
    return octokit.git.createCommit({
        repo: REPO,
        owner : OWNER,
        message : 'Commit from NodeJs',
        tree : newTreeSha,
        parents : [ latestCommitSha ],
        committer : committer,
        author: committer
    })
}

var _getPath = function (file) {
    if (file.attributes.type == 'AuraDefinition') {
        var fileName = file.AuraDefinitionBundle.DeveloperName;
        if (file.DefType == 'COMPONENT') {
            fileName += '.cmp';
        } else if (file.DefType == 'STYLE') {
            fileName += '.css';
        } else if (file.DefType == 'CONTROLLER') {
            fileName += 'Controller.js';
        } else if (file.DefType  == 'HELPER') {
            fileName += 'Helper.js';
        } else if (file.DefType == 'DOCUMENTATION') {
            fileName += '.auradoc';
        } else if (file.DefType == 'SVG') {
            fileName += '.svg';
        } else {
            new Error('File deftype does not supported ' + file.DefType);
        }
        return 'src/aura/' + file.AuraDefinitionBundle.DeveloperName + '/' + fileName;
    } else if (file.attributes.type == 'ApexClass') {
        return 'src/classes/' + file.Name + '.cls';
    } else if (file.attributes.type == 'ApexPage') {
        return 'src/pages/' + file.Name + '.page';
    } else if (file.attributes.type == 'ApexTrigger') {
        return 'src/triggers/' + file.Name;
    }
    throw new Error('File type does not supported ' + file.attributes.type);
}

var _commitChanges = function (allChanges) {
    console.log('here in _commitChanges');
    if (allChanges.length > 0) {
        return _getLastCommit().then(function (latestCommit) {
            //console.debug('_getLastCommit result ' + JSON.stringify(latestCommit));
            var currentChanges = allChanges.shift();
            return _createNewTree(currentChanges.contents, latestCommit.data[0].sha).then(function (newTreeResponse) {
                //console.debug('_createNewTree result ' + JSON.stringify(newTreeResponse));
                return _createCommit(newTreeResponse.data.sha, latestCommit.data[0].sha, currentChanges.committer).then(function (commitResp) {
                    //console.debug('_createCommit result ' + JSON.stringify(commitResp));
                    octokit.git.updateRef({
                        owner: OWNER,
                        repo: REPO,
                        sha: commitResp.data.sha,
                        ref : config.get('GIT_BRANCH')
                        //ref: currentChanges.committer.email == 'slegostaev@mycervello.com' ? 'heads/sl-test' : config.get('GIT_BRANCH')
                    }).then(function (updateRefResp) {
                        if (allChanges.length > 0) {
                            return _commitChanges(allChanges);
                        } else {
                            return new Promise(function (resolve, reject) {
                                resolve();
                            })
                        }
                    }).catch(function (error) {
                        console.error(error)
                    })
                }).catch(function (error) {
                    console.error(error)
                })
            })

        }).catch(function (error) {
            console.error(error)
        })
    }

    return new Promise(function (resolve, reject) {
        console.debug('No updates');
        resolve();
    })
}


var _main = function () {
    /*_getLastCommit2().then(function (lastCommitResp) {
        console.log(lastCommitResp);
    });*/
    console.log(octokit.repos);
    _connectToSalesforce().then(function () {
        console.log('connected to sfdc');
        _getSalesforceFiles().then(function (sfFiles) {
            console.log(sfFiles);
            if (sfFiles.length > 0) {
                _commitChanges(sfFiles).then(function () {
                    console.debug('Commit completed');
                }).catch(function (error) {
                    console.error(error);
                })
            } else {
                console.debug('No changes');
            }

        }).catch(function (error) {
            console.error(error);
        })


    }).catch(function (error) {
        console.error(error);
    })
}

_main();