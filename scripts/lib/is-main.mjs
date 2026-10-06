// True when the module whose import.meta.url is passed is the script node was started
// with, so a script can export its checks for tests and still run as a command:
//
//   if (isMain(import.meta.url)) main();
//
// pathToFileURL escapes '#' and '%' in the checkout's path the way import.meta.url does,
// and realpath follows a symlinked script to the file node actually loaded.

import fs from 'fs';
import { pathToFileURL } from 'url';

export function isMain(moduleUrl) {
    return Boolean(process.argv[1]) && moduleUrl === pathToFileURL(fs.realpathSync(process.argv[1])).href;
}
