const fs = require('fs');
const path = require('path');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace Logger.error("msg", err) -> Logger.error({err}, "msg")
    // Also warn, info, debug
    const regex = /Logger\.(error|warn|info|debug)\((['"`].*?['"`]),\s*([a-zA-Z0-9_]+)\)/g;
    
    // Also handle cases with template strings that might span multiple lines if any, but mostly they are single line
    let newContent = content.replace(regex, 'Logger.$1({ err: $3 }, $2)');
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

function walk(dir) {
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            walk(file);
        } else {
            if (file.endsWith('.ts')) {
                processFile(file);
            }
        }
    });
}

walk('./src');
console.log('Done');
