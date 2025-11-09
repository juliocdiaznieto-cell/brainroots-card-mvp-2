// scripts/generate-license.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const privateKeyPath = path.join(__dirname, 'private.pem');
const publicKeyPath = path.join(__dirname, 'public.pem');

const command = process.argv[2];

if (command === 'generate-keys') {
  generateKeys();
} else if (command === 'generate-license') {
  generateLicense();
} else {
  console.log('Usage:');
  console.log('  node scripts/generate-license.js generate-keys');
  console.log('  node scripts/generate-license.js generate-license');
}

function generateKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);

  console.log('Successfully generated public and private keys:');
  console.log(`- ${privateKeyPath}`);
  console.log(`- ${publicKeyPath}`);
  console.log('\nIMPORTANT: Keep your private.pem file secret!');
}

function generateLicense() {
  if (!fs.existsSync(privateKeyPath)) {
    console.error('Error: private.pem not found. Please generate keys first with `generate-keys`.');
    return;
  }

  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const dataToSign = 'VALID_LICENSE'; // This is the data we're signing

  const sign = crypto.createSign('SHA256');
  sign.update(dataToSign);
  sign.end();

  const signature = sign.sign(privateKey, 'base64');

  console.log('Generated License Key:');
  console.log(signature);
}
