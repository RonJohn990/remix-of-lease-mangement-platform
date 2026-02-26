#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const adminFilePath = path.join(__dirname, 'admins.json');

function loadAdmins() {
    if (fs.existsSync(adminFilePath)) {
        return JSON.parse(fs.readFileSync(adminFilePath));
    }
    return [];
}

function saveAdmins(admins) {
    fs.writeFileSync(adminFilePath, JSON.stringify(admins, null, 2));
}

function createAdmin(username) {
    const admins = loadAdmins();
    if (!admins.includes(username)) {
        admins.push(username);
        saveAdmins(admins);
        console.log(`Admin ${username} created.`);
    } else {
        console.log(`Admin ${username} already exists.`);
    }
}

function deleteAdmin(username) {
    const admins = loadAdmins();
    const index = admins.indexOf(username);
    if (index > -1) {
        admins.splice(index, 1);
        saveAdmins(admins);
        console.log(`Admin ${username} deleted.`);
    } else {
        console.log(`Admin ${username} does not exist.`);
    }
}

function resetAdmins() {
    const admins = loadAdmins();
    if (admins.length > 0) {
        saveAdmins([]);
        console.log('All admins have been reset.');
    } else {
        console.log('No admins to reset.');
    }
}

const action = process.argv[2];
const username = process.argv[3];

if (action === 'create' && username) {
    createAdmin(username);
} else if (action === 'delete' && username) {
    deleteAdmin(username);
} else if (action === 'reset') {
    resetAdmins();
} else {
    console.log('Usage: node manageAdmins.js create <username>|delete <username>|reset');
}