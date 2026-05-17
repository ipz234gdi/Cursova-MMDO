const { app, BrowserWindow } = require('electron')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 720
  })

  win.loadFile('index.html')
  // win.webContents.on('console-message', (event, level, message) => {
  //   console.log('[RENDERER]:', message)
  // })
}

app.on('ready', () => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})