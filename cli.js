#!/usr/bin/env node
"use strict";

require("yargs")
    .usage('$0 command')
    .command('create', 'create a new static website on Fastly', {
        domain: {
            string: true,
            describe: 'domain name(s) of the new static website. E.G. "--domain example.com --domain www.example.com',
            demandOption: true
        },
        s3o: {
            boolean: true,
            describe: 'Whether to have the website be behind S3O',
            demandOption: true
        },
        name: {
            string: true,
            describe: 'name of the new Fastly service being created. This is used when searching on https://manage.fastly.com',
            demandOption: true
        },
        directory: {
            string: true,
            describe: 'directory which contains the content for the website. E.G. "--directory ./website"',
            demandOption: true
        },
        ['fastly-api-key']: {
            string: true,
            describe: 'API key used to authenticate with Fastly',
            demandOption: true
        }
    }, async function createNewStaticSiteOnFastly(argv) {
        const axios = require('axios');
        const apiEntryPoint = 'https://api.fastly.com/';
        const fastly = axios.create({
            baseURL: apiEntryPoint,
            headers: {
                'Fastly-Key': argv["fastly-api-key"]
            }
        });

        const domains = Array.isArray(argv.domain) ? argv.domain : [argv.domain];

        //   step 1 - create new Fastly service
        let serviceID;
        let version;
        try {
            console.log(`Creating a new Fastly service with the name "${argv.name}".`);
            const response = await fastly.post('/service', {
                name: argv.name
            });
            serviceID = response.data.id;
            version = response.data.versions[response.data.versions.length - 1].number;
            console.log(`A new Fastly service has been created with the Service ID "${serviceID}".`);
            console.log(`You can view the service's configuration at https://manage.fastly.com/configure/services/${serviceID}`);
        } catch (e) {
            if (e.response && e.response.status == 401) {
                console.error('The Fastly API key provided via --fastly-api-key is either invalid or has expired.');
                process.exit(1);
            }
            if (e.response && e.response.status == 409) {
                console.error(`The name "${argv.name}" is already registered on Fastly. Please choose a different name.`);
                process.exit(1);
            }
            if (e.response) {
                console.error(e.toString(), e.response.data);
            } else {
                console.error(e.toString(), e);
            }
            console.error(e.stack);
            process.exit(1);
        }

        // Add domains to the service
        try {
            console.log(`Adding domains a new Fastly service with the name "${argv.name}".`);
            for (const domain of domains) {
                await fastly.post(`/service/${serviceID}/version/${version}/domain`, {
                    name: argv.domain
                });
            }
            console.log(`Successfully added domains.`);
        } catch (e) {
            console.error(e.toString(), e.response.data);
            console.error(e.stack);
            process.exit(1);
        }

        // Create fake backend
        try {
            console.log(`Adding fake backend.`);
            const response = await fastly.post(`/service/${serviceID}/version/${version}/backend`, {
                ipv4: '127.0.0.1',
                name: 'fake backend',
                port: '80'
            });
            console.log(`Successfully added fake backend.`);
        } catch (e) {
            console.error(e.toString(), e.response.data);
            console.error(e.stack);
            process.exit(1);
        }

        //   step 2 - Make a non-dynamic snippet for main.vcl
        //   Include s3o.vcl if s3o is set to true
        const promisify = require('util').promisify;
        const readFile = promisify(require('fs').readFile);
        const mainVcl = await readFile('./vcl/main.vcl', 'utf-8');
        if (argv.s3o) {
            try {
                console.log(`Adding S3O to the service.`);
                await fastly.post(`/service/${serviceID}/version/${version}/snippet`, {
                    name: 's3o.vcl',
                    dynamic: 0,
                    type: 'init',
                    content: await readFile('./vcl/s3o.vcl', 'utf-8'),
                    priority: 2
                });
                console.log(`Successfully added S3O to the service.`);
            } catch (e) {
                console.error(e.toString(), e.response.data);
                console.error(e.stack);
                process.exit(1);
            }
        }
        try {
            console.log(`Adding the static-site VCL to the service.`);
            await fastly.post(`/service/${serviceID}/version/${version}/snippet`, {
                name: 'main.vcl',
                dynamic: 0,
                type: 'init',
                content: mainVcl,
                priority: 3
            });
            console.log(`Successfully added static-site VCL to the service.`);
        } catch (e) {
            console.error(e.toString(), e.response.data);
            console.error(e.stack);
            process.exit(1);
        }

        // step 3 - Make a dynamic snippet for the static site's contents and content-types
        console.log(`Converting the directory "${argv.directory}" into VCL.`);
        const generateStaticSiteVclForDirectory = require('./index.js');
        console.log(`Successfully converted the directory "${argv.directory}" into VCL.`);
        let snippetID;
        try {
            console.log(`Adding the VCL to the service.`);
            const response = await fastly.post(`/service/${serviceID}/version/${version}/snippet`, {
                name: 'site',
                dynamic: 1,
                type: 'init',
                content: await generateStaticSiteVclForDirectory(argv.directory),
                priority: 1
            });
            snippetID = response.data.id;
            console.log(`Successfully added VCL to the service.`);
        } catch (e) {
            if (e.response && e.response) {
                console.error(e.toString(), e.response.data);
            } else {
                console.error(e)
            }
            console.error(e.stack);
            process.exit(1);
        }

        // step 4 - Active the new service
        try {
            console.log(`Validating the new service.`);
            await fastly.get(`/service/${serviceID}/version/${version}/validate`);
            console.log(`Successfully validating the new service.`);
            console.log(`Activating the new service.`);
            await fastly.put(`/service/${serviceID}/version/${version}/activate`);
            console.log(`Successfully activated the new service.`);
        } catch (e) {
            console.error(e.toString(), e.response.data);
            console.error(e.stack);
            process.exit(1);
        }

        console.log('Nice! We have finished creating a service on Fastly and uploaded the website to it. You should be able to view it at one of the registered domains.');
        console.log(`To update this site, you would run "ssf deploy --service ${serviceID} --snippet ${snippetID} --fastly-api-key your_api_key_here"`);
    })
    .command('deploy', 'deploy a new version of the website', {
        directory: {
            string: true,
            describe: 'directory which contains the content for the website. E.G. "--directory ./website"',
            demandOption: true
        },
        ['fastly-api-key']: {
            string: true,
            describe: 'API key used to authenticate with Fastly',
            demandOption: true
        },
        service: {
            string: true,
            describe: 'Fastly Service ID for the website',
            demandOption: true
        },
        snippet: {
            string: true,
            describe: 'Fastly Snippet ID for the website',
            demandOption: true
        }
    }, async function createNewStaticSiteOnFastly(argv) {
        const axios = require('axios');
        const apiEntryPoint = 'https://api.fastly.com/';
        const fastly = axios.create({
            baseURL: apiEntryPoint,
            headers: {
                'Fastly-Key': argv["fastly-api-key"]
            }
        });

        console.log(`Converting the directory "${argv.directory}" into VCL.`);
        const generateStaticSiteVclForDirectory = require('./index.js');
        console.log(`Successfully converted the directory "${argv.directory}" into VCL.`);
        try {
            console.log(`Adding the VCL to the service.`);
            const response = await fastly.put(`/service/${argv.service}/snippet/${argv.snippet}`, {
                content: await generateStaticSiteVclForDirectory(argv.directory),
            });
            console.log(`Successfully added VCL to the service.`);
        } catch (e) {
            if (e.response && e.response) {
                console.error(e.toString(), e.response.data, e);
            } else {
                console.error(e)
            }
            console.error(e.stack);
            process.exit(1);
        }

        console.log('Nice! We have finished updating the website.');
        console.log(`To update this site, you would run "ssf deploy --service ${argv.service} --snippet ${argv.snippet} --fastly-api-key your_api_key_here"`);
    })
    .help()
    .strict()
    .argv;