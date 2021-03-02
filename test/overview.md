# Testing Liberdus
## Main Features
- Sign up + Sign In
- Account import
- Account export
- Email verification
- Coin transfer
- Change toll amount
- Sending message
- Adding friend
- Removing friend
- Staking coin
- Submit economy proposal
- Submit funding proposal
- Submit voting
- Verify transaction
- Export transaction json

## Sign up + Sign In
### Sign up
#### CLI
- enter `register`
- enter the alias you want
- wait a few second
- enter `query ${wallet_name}` to see if alias is changed
#### Browser
 - visit `/welcome` page
 - click `Sign In` button
 - enter desired username
 - check if username is already taken or not
 - click `Create Account` if username is available
### Sign in
#### CLI
 - not necessary
#### Browser
 - visit `/welcome` page
 - click `Sign In` button
 - enter your username
 - click `Sign In` if valid account found in the local wallet

 ## Account import
### CLI
 - not necessary
### Browser
- visit `/welcome` page
- click `Import Account` button
- enter secret key or scan QR of the key
- click `Import Account` button

 ## Account export
 ### CLI
 - not necessary
### Browser
- follow `Sign In` steps
- visit `setting/export` page
    - click user icon + username at the top right corner of home page
    - click `@username` button
- click `Copy Secret Key` button and store it somewhere safe

## Email verification
### CLI
 - enter `email`
 - enter your email address
 - open your mail box and copy 6 digits code
 - back to CLI tool and enter `verify`
 - enter 6-digits code
### Browser
- follow `Sign In` steps
- visit `email/register` page
    - click user icon + username at the top right corner of home page
    - click `Register Email` button
- enter your email address
- click `Register Email` button
- open your email inbox and copy registration code from liberdus email
- switch back to liberdus app (`email/verify`)
- enter verification code
- click `Submit Verification` button

## Coin transfer
### CLI
- enter `transfer`
- enter the alias/username of receiver's account
- enter amount of tokens
### Browser
- follow `Sign In` steps
- click `Send` button on the home page
- enter `username` and `amount` fields
- click `Send` button

## Change toll amount
### CLI
- enter `toll`
- enter desired toll amount
### Browser
- follow `Sign In` steps
- click `Setting` button from the menu on the left of home page
- click `Toll` button
- on `/setting/toll` page, enter new toll amount
- click `Update Toll Amount` button


## Sending messages
### CLI
- enter `message`
- enter alias/username or public key of other account
- enter the message to send
- use arrow to select `yes` for spending toll if other account is not a friend

### Browser
- follow `Sign In` steps
- click `Message` button from the menu on the left of home page
- on `/message` page, click `New Message` button if there is no exising conversation between user and target account
- enter `username` of the target account

- type your message and click `Send` button

## Adding friend
### CLI
- enter `add friend`
- enter alias/username or public key of friend's account

### Browser
- follow `Sign In` steps
- click `Friends` button from the menu on the left of home page
- on `/setting/friends` page, enter `username` of friend's account
- when account is found, click `(+)` button to add as friend
- click `OK` when confirm message box is shown

## Removing friend
### CLI
- enter `remove friend`
- enter alias/username or public key of friend's account

### Browser
- follow `Sign In` steps
- click `Friends` button from the menu on the left of home page
- on `/setting/friends` page, list of user's friends will be shown
- click `(x)` button beside friend's name to remove from friend list
- click `OK` when confirm message box is shown

## Staking coin
### CLI
- enter `stake`
- use arrow to select `yes` when confirmation is asked

### Browser
- follow `Sign In` steps
- click `Stake` button from the menu on the left of home page
- on `/setting/stake` page, click `Add Stake` button



