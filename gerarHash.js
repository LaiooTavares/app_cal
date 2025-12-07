// Referência: gerarHash.js (Script temporário)
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function generateCredentials() {
    // Defina a senha que você quer usar
    const password = '123'; 
    const saltRounds = 10;

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const apiKey = `prod_sk_${crypto.randomBytes(16).toString('hex')}`;
        
        console.log("--- Dados para o SQL ---");
        console.log("\nPassword Hash (copie tudo, incluindo $2b):");
        console.log(hashedPassword);
        console.log("\nAPI Key (copie tudo):");
        console.log(apiKey);
        console.log("\n--------------------------");

    } catch (err) {
        console.error("Erro ao gerar hash:", err);
    }
}

generateCredentials();