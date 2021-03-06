const Chromy = require('../src')
const path = require('path')

let chromy = new Chromy({visible: true})
chromy.chain()
      .emulate('Nexus6P') // enable touch event
      .goto('file://' + path.join(__dirname, '/pages/event.html'))
      .console((msg) => {
        console.log(msg)
      })
      .mouseMoved(10, 10)
      .sleep(500)
      .mouseMoved(20, 20)
      .sleep(500)
      .mousePressed(20, 30)
      .sleep(500)
      .mouseReleased(20, 30)
      .sleep(500)
      .evaluate(_ => console.log('Do tap'))
      .tap(20, 40)
      .sleep(500)
      .evaluate(_ => console.log('Do double tap'))
      .doubleTap(20, 40)
      .sleep(500)
      .end()
      .then(_ => chromy.close())
      .catch(e => {
        console.log(e)
        chromy.close()
      })

