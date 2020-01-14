const axios = require('axios')
const baseNumber = 99999
const randomNumber = Math.floor((Math.random() * 899999)) + 1
const verificationNumber = baseNumber + randomNumber

axios.post('http://arimaa.com/mailAPI/index.cgi', {
  from: 'liberdus.verify',
  to: `kshifflett707@gmail.com`,
  subject: 'Verify your email for liberdus',
  message: `Please verify your email address by sending a "verify" transaction with the number: ${verificationNumber}`,
  secret: 'Liberdus'
}).then(res => console.log(res)).catch(err => console.log(err))
