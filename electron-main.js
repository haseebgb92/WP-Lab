const {app,BrowserWindow,shell}=require('electron');
const path=require('path');
const os=require('os');
let server;
app.whenReady().then(()=>{
  process.env.WP_LAB_DATA_ROOT=path.join(os.homedir(),'.local','share','wp-lab');
  process.env.WP_LAB_RESOURCE_ROOT=app.isPackaged?path.join(process.resourcesPath,'wp-lab-resources'):__dirname;
  const port=4174;
  server=require('./server').startServer(port);
  const iconPath=path.join(__dirname,'public','icon.png');
  const win=new BrowserWindow({
    width:1180,height:820,minWidth:900,minHeight:650,
    autoHideMenuBar:true,
    icon:iconPath,
    webPreferences:{contextIsolation:true,sandbox:true}
  });
  win.loadURL('http://127.0.0.1:'+port);
  win.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return {action:'deny'}});
});
app.on('window-all-closed',()=>{if(server)try{server.close()}catch{};if(process.platform!=='darwin')app.quit()});
