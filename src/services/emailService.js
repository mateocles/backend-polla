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
    const webUrl = process.env.WEB_APP_URL || 'https://pollamundialista2026cop.netlify.app';
    const resetLink = `${webUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: 'Recupera tu contraseña - Polla Mundialista',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Recuperación de contraseña</h2>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p>Haz clic en el botón para crear una nueva. El enlace expira en <b>1 hora</b>.</p>
          <p style="text-align:center; margin: 28px 0;">
            <a href="${resetLink}" style="background:#00f2ff; color:#06121f; text-decoration:none; font-weight:bold; padding:12px 24px; border-radius:8px; display:inline-block;">Restablecer contraseña</a>
          </p>
          <p style="font-size:12px; color:#666;">Si el botón no funciona, copia este enlace:<br/>${resetLink}</p>
          <p style="font-size:12px; color:#666;">Si no fuiste tú, ignora este correo; tu contraseña no cambiará.</p>
        </div>
      `,
    };

    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        await transporter.sendMail(mailOptions);
        console.log(`Password reset email sent to ${toEmail}`);
      } else {
        console.log(`[Email Mock] Reset link for ${toEmail}: ${resetLink}`);
      }
    } catch (error) {
      console.error('Error sending reset email:', error);
      throw error;
    }
  }
}

module.exports = EmailService;
