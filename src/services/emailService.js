const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // You can use other services or SMTP directly
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

class EmailService {
  static async sendInvite(toEmail, groupName, inviteCode) {
    const inviteLink = `http://localhost:3000/invite?code=${inviteCode}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: `Invitación a la polla del grupo: ${groupName}`,
      html: `
        <p>Hola!</p>
        <p>Te han invitado a unirte a la polla del grupo <b>${groupName}</b>.</p>
        <p>Tu código de invitación es: <b>${inviteCode}</b></p>
        <p>Haz clic en el siguiente enlace para unirte:</p>
        <a href="${inviteLink}">${inviteLink}</a>
      `
    };

    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${toEmail}`);
      } else {
        console.log(`[Email Mock] Sent invite to ${toEmail} for group ${groupName} (Code: ${inviteCode})`);
      }
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }

  static async sendPasswordReset(toEmail, resetToken) {
    // For password reset logic
    console.log(`[Email Mock] Reset token for ${toEmail}: ${resetToken}`);
  }
}

module.exports = EmailService;
