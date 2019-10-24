const { rm } = require('shelljs')

async function main () {
  try {
    rm('-rf', './.pm2 ./db ./logs ./statistics.tsv'.split(' '))
  } catch (e) {
    console.log(e)
  }
}
main()
