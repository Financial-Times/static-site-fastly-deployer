"use strict";

const path = require('path');
const promisify = require('util').promisify;
const readFile = promisify(require('fs').readFile);
const readdir = promisify(require('fs').readdir);

const mime = require('mime');

async function walkDirectory(directoryName, results = []) {
    const directoryEntries = await readdir(directoryName, {withFileTypes: true});
    for (const entry of directoryEntries) {
        const fullPath = path.join(directoryName, entry.name);
        if (entry.isDirectory()) {
            await walkDirectory(fullPath, results);
        } else {
            results.push(fullPath);
        }
    }
    return results;
}

function buildVCLRoutesTable (routes) {
    const encodedRouteMap = routes.map(([route, content]) => [route, encodeURIComponent(content)]);
    const mapping = encodedRouteMap.map(([route, content]) => `"${route}": "${content}"`);

    return `table routes {
        ${mapping.join(',\n\t')}
    }`;
}

function buildContentTypeTable(routes) {
    const mapping = routes.map(route => {
        return `"${route}": "${mime.getType(route)}; charset=utf8"`;
    });

    return `table contentType {
        ${mapping.join(',\n\t')}
    }`;
}

async function generateStaticSiteVclForDirectory(directory) {
    const filePaths = await walkDirectory(directory);
    const filePathContentMap = [];
    const routes = [];
    for (const filePath of filePaths) {
        const filePathContents = await readFile(filePath, 'utf-8');
        const route = '/' + path.relative(directory, filePath);
        routes.push(route);
        filePathContentMap.push([route, filePathContents]);
    }
    const vclRouteTable = buildVCLRoutesTable(filePathContentMap);
    const contentTypeTable = buildContentTypeTable(routes);
    return vclRouteTable + '\n' + contentTypeTable;
}

module.exports = generateStaticSiteVclForDirectory;