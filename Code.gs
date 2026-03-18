// Code.gs - Main Webhook Handler & RAG Engine for PAPRAI PU-HSET
// โค้ดหลักสำหรับจัดการ Webhook และระบบดึงข้อมูลความรู้ (Knowledge Retrieval)

/**
 * ====================================
 * WEBHOOK HANDLER
 * ====================================
 */

function doPost(e) {
  const startTime = new Date();
  console.log(`🌐 Webhook received at ${startTime.toISOString()}`);
  
  try {
    if (!e.postData || !e.postData.contents) {
      return createResponse('Invalid request', 400);
    }

    const contents = JSON.parse(e.postData.contents);
    if (!contents.events || !Array.isArray(contents.events)) {
      return createResponse('Invalid events', 400);
    }
    
    const credentials = getCredentials();
    for (const event of contents.events) {
      processEvent(event, credentials);
    }

    return createResponse({ status: 'success', processed: contents.events.length }, 200);

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return createResponse('Internal error', 500);
  }
}

/**
 * ====================================
 * EVENT PROCESSING
 * ====================================
 */

function processEvent(event, credentials) {
  try {
    const { type, replyToken, source } = event;
    const userId = source?.userId;

    // สร้าง Profile ผู้ใช้ทั่วไป (Guest) ทันทีที่ทักมา
    const userProfile = getUserProfile(userId);
    if (!userProfile) return;

    // เริ่มแสดง Loading Animation ในห้องแชท
    if (userId && ['message', 'follow'].includes(type)) {
      startLoading(userId);
    }

    switch (type) {
      case 'message':
        handleMessage(event, userProfile);
        break;
      case 'follow':
        handleFollow(replyToken, userProfile);
        break;
      default:
        console.log(`⚠️ Unhandled event type: ${type}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing event:`, error);
    if (event.replyToken) {
      sendTextMessage(event.replyToken, "ป้าไพรขออภัยค่ะ เกิดข้อผิดพลาดในระบบประมวลผล กรุณาลองใหม่อีกครั้งนะคะ 🙏");
    }
  }
}

/**
 * ====================================
 * MESSAGE HANDLING
 * ====================================
 */

function handleMessage(event, userProfile) {
  const { message, replyToken } = event;
  
  if (message.type === 'text') {
    const User_Message = message.text.trim();
    
    // 1. ตรวจสอบคำสั่งพิเศษ (Special Commands)
    if (handleSpecialCommands(User_Message, replyToken, userProfile)) return;

    // 2. ส่งประมวลผลด้วย AI
    processAIMessage(User_Message, replyToken, userProfile);
    
  } else {
    // กรณีส่งสติ๊กเกอร์ รูปภาพ หรืออื่นๆ
    sendTextMessage(replyToken, "ป้าไพรขออภัยค่ะ ตอนนี้ป้าไพรรองรับเฉพาะการตอบคำถามด้วย 'ข้อความ' เท่านั้นนะคะ พิมพ์คำถามทิ้งไว้ได้เลยค่ะ 📝");
  }
}

function handleSpecialCommands(User_Message, replyToken, userProfile) {
  const command = User_Message.toLowerCase();
  
  switch (command) {
    case '/clear':
    case 'clear':
      clearChatHistory(userProfile.userId);
      sendTextMessage(replyToken, "✅ ป้าไพรล้างความจำประวัติการสนทนาให้เรียบร้อยแล้วค่ะ เริ่มคุยเรื่องใหม่ได้เลยนะคะ");
      return true;
      
    case '/help':
    case 'help':
      const helpText = `🤖 คู่มือการใช้งาน PAPRAI PU-HSET\n\nสวัสดีค่ะ ป้าไพรยินดีให้คำปรึกษาเกี่ยวกับหลักสูตรห้องเรียนพิเศษ (PU-HSET) ค่ะ 😊\n\n📌 คำสั่งพื้นฐาน:\n• พิมพ์คำถามที่สงสัยได้เลย เช่น "ค่าเทอมเท่าไหร่", "สายวิทย์เรียนอะไรบ้าง"\n• พิมพ์ /clear เพื่อลบประวัติการคุย\n• พิมพ์ /help เพื่ออ่านคู่มือนี้\n\nมีอะไรให้ป้าไพรช่วยอธิบายไหมคะ?`;
      sendTextMessage(replyToken, helpText);
      return true;
      
    default:
      return false;
  }
}

/**
 * ====================================
 * AI & KNOWLEDGE RETRIEVAL (RAG)
 * ====================================
 */

function processAIMessage(User_Message, replyToken, userProfile) {
  try {
    console.log(`🤖 Processing AI request...`);
    
    // 1. ดึงข้อมูลจากฐานข้อมูล Google Sheets (Knowledge Base)
    const retrievedContext = retrieveKnowledge();
    
    // 2. ดึงประวัติการสนทนาก่อนหน้า
    const chatHistory = getChatHistory(userProfile.userId);
    
    // 3. สร้าง Prompt
    const systemPrompt = getSystemPrompt();
    const userPrompt = constructUserPrompt(chatHistory, retrievedContext, User_Message);
    
    // 4. เรียก OpenAI API
    const AI_Response = generateAIResponse(systemPrompt, userPrompt);
    
    // 5. วิเคราะห์หมวดหมู่ และประเมิน Tokens ที่ใช้
    const category = autoTagMessage(User_Message);
    const Tokens_Used = estimateTokens(User_Message + AI_Response);
    
    // 6. บันทึกข้อมูลลง Sheets
    saveChatHistory(userProfile, User_Message, AI_Response, category, Tokens_Used);
    
    // 7. ส่งคำตอบกลับไปที่ LINE
    sendTextMessage(replyToken, AI_Response);
    
  } catch (error) {
    console.error('❌ AI processing error:', error);
    sendTextMessage(replyToken, "ป้าไพรขออภัยค่ะ ขณะนี้มีผู้สอบถามเข้ามาเป็นจำนวนมาก หรือระบบกำลังขัดข้อง รบกวนคุณพ่อคุณแม่ลองพิมพ์ถามใหม่อีกครั้งในสักครู่นะคะ ⏳🙏");
  }
}

// ฟังก์ชันดึงความรู้ทั้งหมดจากแผ่นงาน FAQ_Data และ Curriculum_Info
function retrieveKnowledge() {
  try {
    const credentials = getCredentials();
    if (!credentials.SPREADSHEET_ID) return '';
    
    const ss = SpreadsheetApp.openById(credentials.SPREADSHEET_ID);
    let context = '';

    // ดึงข้อมูล FAQ
    const faqSheet = ss.getSheetByName('FAQ_Data');
    if (faqSheet) {
      const data = faqSheet.getDataRange().getDisplayValues();
      if (data.length > 1) {
        context += '📌 [คำถามที่พบบ่อย (FAQ)]:\n';
        for (let i = 1; i < data.length; i++) {
          if (data[i][1] && data[i][2]) {
            context += `คำถาม: ${data[i][1]}\nคำตอบ: ${data[i][2]}\n\n`;
          }
        }
      }
    }

    // ดึงข้อมูลโครงสร้างหลักสูตร
    const curSheet = ss.getSheetByName('Curriculum_Info');
    if (curSheet) {
      const data = curSheet.getDataRange().getDisplayValues();
      if (data.length > 1) {
        context += '📚 [ข้อมูลเชิงลึกและโครงสร้างหลักสูตร]:\n';
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] && data[i][1]) {
            context += `หัวข้อ: ${data[i][0]}\nรายละเอียด: ${data[i][1]}\n\n`;
          }
        }
      }
    }
    
    return context;
  } catch (error) {
    console.error('❌ Error retrieving knowledge:', error);
    return '';
  }
}

/**
 * ====================================
 * DATA LOGGING & HISTORY
 * ====================================
 */

function getChatHistory(User_ID) {
  try {
    const ss = SpreadsheetApp.openById(getCredentials().SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Chat_History');
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    
    // ดึงเฉพาะประวัติของผู้ใช้คนนี้ และจำกัดจำนวนตาม MAX_HISTORY
    const userHistory = data
      .filter(row => row[1] === User_ID) // Column B = User_ID
      .slice(-APP_CONFIG.MAX_HISTORY)
      .map(row => ({
        userMessage: row[2], // Column C = User_Message
        aiResponse: row[3]   // Column D = AI_Response
      }));
      
    return userHistory;
  } catch (error) {
    console.error('❌ Error getting history:', error);
    return [];
  }
}

function saveChatHistory(userProfile, User_Message, AI_Response, category, Tokens_Used) {
  try {
    const ss = SpreadsheetApp.openById(getCredentials().SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Chat_History');
    if (!sheet) return;
    
    const timestamp = new Date();
    
    // ลำดับ Column: Timestamp, User_ID, User_Message, AI_Response, Category, Tokens_Used
    sheet.appendRow([
      timestamp, 
      userProfile.userId, 
      User_Message, 
      AI_Response, 
      category, 
      Tokens_Used
    ]);
    
    // อัปเดตสถิติรายวัน (อ้างอิงฟังก์ชันใน Config.gs)
    if (typeof updateAnalytics === 'function') {
      updateAnalytics(userProfile, category, Tokens_Used);
    }
    
  } catch (error) {
    console.error('❌ Error saving history:', error);
  }
}

function clearChatHistory(User_ID) {
  try {
    const ss = SpreadsheetApp.openById(getCredentials().SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Chat_History');
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues();
    const rowsToDelete = [];
    
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][1] === User_ID) {
        rowsToDelete.push(i + 1);
      }
    }
    
    rowsToDelete.forEach(rowNum => sheet.deleteRow(rowNum));
  } catch (error) {
    console.error('❌ Error clearing history:', error);
  }
}

/**
 * ====================================
 * LINE API FUNCTIONS
 * ====================================
 */

function sendTextMessage(replyToken, text) {
  const credentials = getCredentials();
  const url = 'https://api.line.me/v2/bot/message/reply';
  const options = {
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Authorization': `Bearer ${credentials.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    method: 'post',
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }]
    }),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

function handleFollow(replyToken, userProfile) {
  const welcomeText = `สวัสดีค่ะ ยินดีต้อนรับเข้าสู่บริการถาม-ตอบ หลักสูตรห้องเรียนพิเศษ เตรียมอุดมวิทยาศาสตร์สุขภาพ และวิศวกรรมเทคโนโลยี (PU-HSET) โรงเรียนสาธิต มหาวิทยาลัยศิลปากร (มัธยมศึกษา) 🎓✨\n\nฉันคือ "ป้าไพร" AI ผู้ช่วยแนะแนวประจำหลักสูตรนี้ค่ะ คุณพ่อคุณแม่หรือนักเรียนสามารถพิมพ์คำถามที่สงสัยเกี่ยวกับหลักสูตร การเรียนการสอน หรือค่าเทอม ทิ้งไว้ได้เลยนะคะ ป้าไพรพร้อมให้ข้อมูลค่ะ 😊`;
  sendTextMessage(replyToken, welcomeText);
}

function startLoading(userId) {
  try {
    const credentials = getCredentials();
    const url = 'https://api.line.me/v2/bot/chat/loading/start';
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      method: 'post',
      payload: JSON.stringify({ chatId: userId }),
      muteHttpExceptions: true
    };
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    console.error('⚠️ Failed to start loading indicator:', error);
  }
}

/**
 * ====================================
 * UTILITY FUNCTIONS
 * ====================================
 */

function createResponse(data, statusCode = 200) {
  const output = typeof data === 'string' ? { message: data } : data;
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON)
    .setStatusCode(statusCode);
}

function estimateTokens(text) {
  // ประมาณการ Tokens คร่าวๆ (สำหรับภาษาไทยมักใช้ 1 คำ ~ 2-3 tokens)
  return Math.ceil(text.length / 2.5);
}
