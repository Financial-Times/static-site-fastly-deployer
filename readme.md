# static-site-fastly-deployer

A tool to turn a directory of text-only files into VCL and deploy them to Fastly.

## Requirements

- NodeJS 10 or higher
- Fastly API key with "global" permissions

## Commands

### Create

This will create a new Fastly service and deploy the website to it.

#### Options

- s3o -- [boolean] [required] -- Whether to have the website be behind <abbr title="FT Staff Single Sign On">S3O</abbr>.
- name -- [string] [required] -- Name of the new Fastly service being created. This is used when searching on https://manage.fastly.com
- domain -- [string] [required] -- Domain name(s) of the new static website. E.G. `--domain example.com --domain www.example.com`
- fastly-api-key -- [string] [required] -- API key used to authenticate with Fastly. The key would need "global" permissions.
- directory -- [string] [required] -- Directory which contains the content for the website.

