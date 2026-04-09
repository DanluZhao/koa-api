require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('🚀 正在尝试连接到数据库...');
  console.table({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME
  });

  try {
    // 1. 创建连接
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 5000 // 5秒超时
    });

    console.log('✅ 连接成功！');

    // 2. 执行一个简单的查询
    const [rows] = await connection.execute('SELECT NOW() AS currentTime');
    console.log('📅 数据库当前时间:', rows[0].currentTime);

    // 3. 关闭连接
    await connection.end();
    console.log('👋 连接已正常关闭。');
    
  } catch (error) {
    console.error('❌ 连接失败！错误信息如下：');
    console.error('---------------------------');
    console.error(error.message);
    console.error('---------------------------');
    
    if (error.code === 'ETIMEDOUT') {
      console.log('💡 建议：检查阿里云安全组是否放行了 3306 端口。');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('💡 建议：检查数据库账号密码是否正确。');
    }
  }
}

testConnection();