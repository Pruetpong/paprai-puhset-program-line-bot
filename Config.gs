// Config.gs - Configuration and AI Engine for PAPRAI PU-HSET
// ไฟล์ Configuration และระบบ AI สำหรับหลักสูตร PU-HSET

/**
 * ====================================
 * APPLICATION CONFIGURATION
 * ====================================
 */

const APP_CONFIG = {
  // จำนวนประวัติการสนทนาสูงสุดที่เก็บไว้เป็นบริบท (Context)
  MAX_HISTORY: 5,
  
  // AI Model ที่ใช้
  AI_MODEL: 'gpt-4o',
  OPENAI_ENDPOINT: 'https://api.openai.com/v1/chat/completions',
  
  // พารามิเตอร์ AI
  AI_PARAMS: {
    temperature: 0.3, // ลด temperature ลงเพื่อให้ตอบตรงตามเอกสาร (Fact-based) มากขึ้น
    max_tokens: 1500
  },
  
  // หมวดหมู่คำถามที่รองรับ (สำหรับ Auto-tagging สถิติ)
  CATEGORIES: [
    'ค่าธรรมเนียมการศึกษา',
    'โครงสร้างหลักสูตร',
    'สายวิทยาศาสตร์สุขภาพ',
    'สายวิศวกรรมเทคโนโลยี',
    'คุณสมบัติและการรับสมัคร',
    'การเรียนการสอน',
    'การศึกษาต่อ',
    'อื่นๆ'
  ],
  
  // ตั้งค่าความปลอดภัย
  SECURITY: {
    REQUIRE_WHITELIST: false, // ปิดการจำกัดสิทธิ์ เพื่อให้ผู้ปกครอง/นักเรียน ทั่วไปใช้งานได้
    RATE_LIMIT_PER_HOUR: 100
  }
};

/**
 * ====================================
 * CREDENTIALS MANAGEMENT
 * ====================================
 */

/**
 * ฟังก์ชันตั้งค่า Credentials ครั้งแรก
 * วิธีใช้งาน:
 * 1. นำค่า API ต่างๆ มาใส่ในช่อง YOUR_..._HERE
 * 2. กด Run ฟังก์ชัน setupCredentials() 1 ครั้ง
 */
function setupCredentials() {
  const credentials = {
    OPENAI_API_KEY: 'YOUR_OPENAI_API_KEY_HERE',
    LINE_CHANNEL_ACCESS_TOKEN: 'YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE',
    SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE'
  };
  
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('OPENAI_API_KEY', credentials.OPENAI_API_KEY);
  scriptProperties.setProperty('LINE_CHANNEL_ACCESS_TOKEN', credentials.LINE_CHANNEL_ACCESS_TOKEN);
  scriptProperties.setProperty('SPREADSHEET_ID', credentials.SPREADSHEET_ID);
  
  console.log('✅ Credentials setup completed');
}

function getCredentials() {
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    return {
      OPENAI_API_KEY: scriptProperties.getProperty('OPENAI_API_KEY'),
      LINE_CHANNEL_ACCESS_TOKEN: scriptProperties.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),
      SPREADSHEET_ID: scriptProperties.getProperty('SPREADSHEET_ID')
    };
  } catch (error) {
    console.error('❌ Error getting credentials:', error);
    throw new Error('Failed to retrieve credentials');
  }
}

/**
 * ====================================
 * USER PROFILE MANAGEMENT
 * ====================================
 */

// สำหรับ PU-HSET บอทเป็นสาธารณะ ทุกคนที่ทักมาจะได้รับ Profile เป็น Guest ทันที
function getUserProfile(userId) {
  if (!userId) return null;
  return {
    userId: userId,
    name: 'ผู้ปกครอง/นักเรียน',
    role: 'GUEST',
    department: 'Public'
  };
}

/**
 * ====================================
 * SYSTEM PROMPT MANAGEMENT
 * ====================================
 */

function getSystemPrompt() {
  return `คุณคือ "ป้าไพร" (PAPRAI) - AI Assistant ที่เป็นมิตร อบอุ่น และมีความน่าเชื่อถือ ทำหน้าที่เป็น "ผู้ช่วยประชาสัมพันธ์และให้คำแนะนำหลักสูตร PU-HSET" ของโรงเรียนสาธิต มหาวิทยาลัยศิลปากร (มัธยมศึกษา)

🤖 ข้อมูลเกี่ยวกับป้าไพร
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
บทบาท: ผู้ช่วยแนะแนวหลักสูตรห้องเรียนพิเศษ เตรียมอุดมวิทยาศาสตร์สุขภาพ และวิศวกรรมเทคโนโลยี (PU-HSET)
กลุ่มเป้าหมาย: ผู้ปกครอง และนักเรียนที่สนใจสมัครเข้าศึกษาต่อในระดับชั้น ม.4

🗣️ การเรียกตัวเองและการสื่อสาร
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ เรียกตัวเองว่า "ป้าไพร"
✅ ใช้ "คะ" (เสียงสูง) เมื่อถามคำถาม หรือแสดงความใส่ใจ เช่น "มีส่วนไหนให้ป้าไพรช่วยอธิบายเพิ่มไหมคะ"
✅ ใช้ "ค่ะ" (เสียงต่ำ) เมื่อยืนยัน ตอบรับ หรือให้ข้อมูล เช่น "ค่าเทอม 75,000 บาทต่อภาคการศึกษาค่ะ"
✅ ใช้ภาษาไทยที่สุภาพ อ่อนน้อม เป็นทางการแต่เป็นกันเอง คล้ายครูแนะแนวที่ใจดี
✅ ตอบคำถามจาก ข้อมูลอ้างอิง (Context) ที่ระบบจัดเตรียมไว้ให้เท่านั้น
✅ หากคำถามไหนไม่มีข้อมูลใน Context ให้ตอบว่า "ป้าไพรต้องขออภัยด้วยนะคะ ข้อมูลส่วนนี้ป้าไพรยังไม่มีรายละเอียดที่แน่ชัด รบกวนคุณพ่อคุณแม่หรือนักเรียนติดต่อสอบถามกับทางฝ่ายแนะแนวของโรงเรียนโดยตรงนะคะ 🙏"

CRITICAL รูปแบบการตอบ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 ห้ามใช้ Markdown formatting อย่างเด็ดขาด (ห้ามใช้ ** ## *** - หรือ 1. 2. 3. แบบอัตโนมัติ)
✅ ใช้ Emoji สื่ออารมณ์และแบ่งสัดส่วนเนื้อหา เช่น 📌 💡 ⚠️ ✅ 📚 🎓
✅ ขึ้นบรรทัดใหม่เพื่อแบ่งหัวข้อให้อ่านง่าย
✅ เครื่องหมาย ━━━ หรือ • ใช้สำหรับลิสต์รายการได้

📚 กฎข้อบังคับการให้ข้อมูล (Privacy & Accuracy)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 ห้ามแต่งข้อมูล โครงสร้างหลักสูตร ค่าเทอม หรือวันที่ขึ้นมาเองโดยเด็ดขาด
🚫 ไม่ขอข้อมูลส่วนตัวที่ระบุตัวตนได้ (ชื่อจริง เบอร์โทร) จากผู้ใช้งาน`;
}

// สร้าง Prompt โดยรวม Context ที่ดึงมาจาก Sheets (RAG) + ประวัติแชท + คำถามล่าสุด
function constructUserPrompt(chatHistory, retrievedContext, currentMessage) {
  let prompt = '';
  
  // 1. เพิ่ม Context (Knowledge Base) ที่ค้นหามาได้
  prompt += '━━━━━━━━━━━━━━━━━━━━━━\n';
  prompt += 'ข้อมูลอ้างอิงสำหรับตอบคำถาม (Knowledge Base Context)\n';
  prompt += '━━━━━━━━━━━━━━━━━━━━━━\n';
  if (retrievedContext && retrievedContext.length > 0) {
    prompt += retrievedContext + '\n\n';
  } else {
    prompt += 'ไม่พบข้อมูลที่เกี่ยวข้องโดยตรง (อ้างอิงตามความรู้ทั่วไปของหลักสูตร หรือแจ้งให้ติดต่อโรงเรียน)\n\n';
  }
  
  // 2. เพิ่มประวัติการสนทนา
  if (chatHistory && chatHistory.length > 0) {
    prompt += '━━━━━━━━━━━━━━━━━━━━━━\n';
    prompt += 'ประวัติการสนทนาก่อนหน้า\n';
    prompt += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
    chatHistory.forEach((msg) => {
      prompt += `ผู้ใช้: ${msg.userMessage}\n\n`;
      prompt += `ป้าไพร: ${msg.aiResponse}\n\n`;
    });
  }
  
  // 3. เพิ่มคำถามปัจจุบัน
  prompt += '━━━━━━━━━━━━━━━━━━━━━━\n';
  prompt += 'คำถามปัจจุบัน\n';
  prompt += '━━━━━━━━━━━━━━━━━━━━━━\n\n';
  prompt += `ผู้ใช้: ${currentMessage}\n\n`;
  prompt += 'ป้าไพร: ';
  
  return prompt;
}

/**
 * ====================================
 * OPENAI API FUNCTIONS
 * ====================================
 */

function generateAIResponse(systemPrompt, userPrompt) {
  const credentials = getCredentials();
  if (!credentials.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
  
  const payload = {
    model: APP_CONFIG.AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    ...APP_CONFIG.AI_PARAMS
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${credentials.OPENAI_API_KEY}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(APP_CONFIG.OPENAI_ENDPOINT, options);
    const responseCode = response.getResponseCode();
    if (responseCode !== 200) throw new Error(`OpenAI API error (${responseCode}): ${response.getContentText()}`);
    
    const json = JSON.parse(response.getContentText());
    if (!json.choices || json.choices.length === 0) throw new Error('No response from OpenAI');

    return json.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating AI response:', error);
    throw error;
  }
}

/**
 * ====================================
 * AUTO-TAGGING SYSTEM
 * ====================================
 */

function autoTagMessage(message) {
  const lowerMessage = message.toLowerCase();
  
  const keywords = {
    'ค่าธรรมเนียมการศึกษา': ['ค่าเทอม', 'จ่าย', 'บาท', 'ค่าใช้จ่าย', 'ค่าหนังสือ', 'ค่าอาหาร'],
    'โครงสร้างหลักสูตร': ['หลักสูตร', 'หน่วยกิต', 'รายวิชา', 'เวลาเรียน', 'กิจกรรม'],
    'สายวิทยาศาสตร์สุขภาพ': ['วิทย์', 'สุขภาพ', 'แพทย์', 'พยาบาล', 'เภสัช', 'สหเวช'],
    'สายวิศวกรรมเทคโนโลยี': ['วิศวะ', 'เทคโนโลยี', 'คอมพิวเตอร์', 'หุ่นยนต์', 'AI', 'iot'],
    'คุณสมบัติและการรับสมัคร': ['สมัคร', 'สอบเข้า', 'เกณฑ์', 'รับกี่คน', 'รับสมัคร'],
    'การเรียนการสอน': ['สอนยังไง', 'EP', 'ภาษาอังกฤษ', 'ครูต่างชาติ', 'ต่างประเทศ', 'ดูงาน'],
    'การศึกษาต่อ': ['เรียนต่อ', 'มหาลัย', 'เข้าคณะ', 'โควตา', 'portfolio']
  };
  
  let maxScore = 0;
  let bestCategory = 'อื่นๆ';
  
  for (let category in keywords) {
    let score = keywords[category].reduce((count, keyword) => count + (lowerMessage.includes(keyword) ? 1 : 0), 0);
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }
  
  return bestCategory;
}

/**
 * ====================================
 * ANALYTICS & LOGGING FUNCTIONS
 * ====================================
 */

function updateAnalytics(userProfile, category, tokensUsed) {
  try {
    const credentials = getCredentials();
    if (!credentials.SPREADSHEET_ID) return;

    const ss = SpreadsheetApp.openById(credentials.SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Usage_Analytics');
    if (!sheet) return;
    
    const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === today && data[i][1] === userProfile.userId) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      const categories = {};
      categories[category] = 1;
      sheet.appendRow([today, userProfile.userId, 1, JSON.stringify(categories), tokensUsed]);
    } else {
      const totalMessages = data[rowIndex - 1][2] + 1;
      const categories = JSON.parse(data[rowIndex - 1][3] || '{}');
      categories[category] = (categories[category] || 0) + 1;
      const totalTokens = data[rowIndex - 1][4] + tokensUsed;
      
      sheet.getRange(rowIndex, 3).setValue(totalMessages);
      sheet.getRange(rowIndex, 4).setValue(JSON.stringify(categories));
      sheet.getRange(rowIndex, 5).setValue(totalTokens);
    }
  } catch (error) {
    console.error('Error updating analytics:', error);
  }
}

/**
 * ====================================
 * SETUP FUNCTIONS (สร้าง Sheets ให้อัตโนมัติ)
 * ====================================
 */

function setupSpreadsheet() {
  try {
    const ss = SpreadsheetApp.create('PAPRAI PU-HSET Database');
    
    // 1. FAQ_Data
    const faqSheet = ss.getActiveSheet();
    faqSheet.setName('FAQ_Data');
    faqSheet.appendRow(['Category', 'Question', 'Answer']);
    faqSheet.setFrozenRows(1);
    faqSheet.getRange('A1:C1').setBackground('#4a86e8').setFontColor('#ffffff').setFontWeight('bold');
    
    // 2. Curriculum_Info
    const curSheet = ss.insertSheet('Curriculum_Info');
    curSheet.appendRow(['Topic', 'Details']);
    curSheet.setFrozenRows(1);
    curSheet.getRange('A1:B1').setBackground('#ff9900').setFontColor('#ffffff').setFontWeight('bold');
    
    // 3. Chat_History
    const chatSheet = ss.insertSheet('Chat_History');
    chatSheet.appendRow(['Timestamp', 'User_ID', 'User_Message', 'AI_Response', 'Category', 'Tokens_Used']);
    chatSheet.setFrozenRows(1);
    chatSheet.getRange('A1:F1').setBackground('#38761d').setFontColor('#ffffff').setFontWeight('bold');
    
    // 4. Usage_Analytics
    const analyticsSheet = ss.insertSheet('Usage_Analytics');
    analyticsSheet.appendRow(['Date', 'User_ID', 'Total_Messages', 'Categories', 'Total_Tokens']);
    analyticsSheet.setFrozenRows(1);
    analyticsSheet.getRange('A1:E1').setBackground('#9900ff').setFontColor('#ffffff').setFontWeight('bold');
    
    console.log(`✅ Spreadsheet created: ${ss.getId()}`);
    console.log(`📊 URL: ${ss.getUrl()}`);
    
    // นำ ID ที่ได้ไปกรอกใน setupCredentials()
    return ss.getId();
    
  } catch (error) {
    console.error('Error creating spreadsheet:', error);
    throw error;
  }
}
