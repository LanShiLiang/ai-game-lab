import {buildWeb} from './build-web.mjs';
if(process.argv.length>2)throw Error('Game composition moved to deploy:prepare with an external state directory. npm run build builds only the platform.');
await buildWeb();
