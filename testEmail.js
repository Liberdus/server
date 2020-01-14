const nodemailer = require('nodemailer')
const smtpTransport = require('nodemailer-smtp-transport')

// FOR SENDING VERIFICATION EMAILS
let transporter = nodemailer.createTransport({
  service: 'SendPulse', // no need to set host or port etc.
  auth: {
    user: 'kshifflett707@gmail.com',
    pass: '8omsYHEBFb7QQ'
  }
})

const baseNumber = 99999
const randomNumber = Math.floor((Math.random() * 899999)) + 1
const verificationNumber = baseNumber + randomNumber

const mailOptions = {
  from: 'kyle@shardus.com',
  to: `kshifflett707@gmail.com`,
  subject: 'Verify your email for liberdus',
  text: `Please verify your email address by sending a "verify" transaction with the number: ${verificationNumber}`
}

transporter.sendMail(mailOptions, function (error, info) {
  if (error) {
    console.log(error)
  } else {
    console.log('Email sent: ' + info.response)
  }
})
