// Code.gs - Main Webhook Handler for PAPRAI PU-HSET
// โค้ดหลักสำหรับจัดการ Webhook และ Pipeline การตอบคำถาม
// เวอร์ชัน: 2.1 (Gap 1–4, 6, 8 + แยก Spreadsheet 2 ไฟล์ + LLM Provider ใน PropertiesService)

/**
 * ====================================
 * WEBHOOK HANDLER
 * จุดรับข้อมูลจาก LINE Platform
 * ====================================
 */

function doPost(e) {
  const startTime = new Date();
  console.log(`🌐 Webhook received at ${startTime.toISOString()}`);

  try {
    // ตรวจสอบ Request พื้นฐาน
    if (!e.postData || !e.postData.contents) {
      console.error('❌ Invalid request: no postData');
      return createResponse('Invalid request', 400);
    }

    const contents = JSON.parse(e.postData.contents);
    if (!contents.events || !Array.isArray(contents.events)) {
      console.error('❌ Invalid events format');
      return createResponse('Invalid events', 400);
    }

    console.log(`📨 Processing ${contents.events.length} event(s)`);

    // ดึง Credentials ครั้งเดียว แล้วส่งต่อให้ทุก event
    const credentials = getCredentials();

    for (const event of contents.events) {
      processEvent(event, credentials);
    }

    const processingTime = new Date() - startTime;
    console.log(`✅ Webhook completed in ${processingTime}ms`);

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

    // สร้าง Guest Profile สำหรับผู้ใช้ทุกคน
    const userProfile = getUserProfile(userId);
    if (!userProfile) {
      console.warn('⚠️ No userId found in event source — skipping');
      return;
    }

    // เริ่มแสดง Loading Animation ให้ผู้ใช้เห็นทันทีที่รับข้อความ
    if (userId && ['message', 'follow'].includes(type)) {
      startLoading(userId, credentials);
    }

    switch (type) {
      case 'message':
        handleMessage(event, userProfile, credentials);
        break;
      case 'follow':
        handleFollow(replyToken, credentials);
        break;
      case 'unfollow':
        console.log(`👋 User unfollowed: ${userId}`);
        break;
      default:
        console.log(`⚠️ Unhandled event type: ${type}`);
    }

  } catch (error) {
    console.error('❌ Error processing event:', error);
    // พยายามส่งข้อความ error กลับหากมี replyToken
    if (event.replyToken) {
      try {
        sendTextMessage(
          event.replyToken,
          'ป้าไพรขออภัยค่ะ เกิดข้อผิดพลาดในระบบประมวลผล กรุณาลองใหม่อีกครั้งนะคะ 🙏',
          getCredentials()
        );
      } catch (replyError) {
        console.error('❌ Failed to send error reply:', replyError);
      }
    }
  }
}

/**
 * ====================================
 * MESSAGE HANDLING
 * ====================================
 */

function handleMessage(event, userProfile, credentials) {
  const { message, replyToken } = event;

  if (message.type === 'text') {
    const userMessage = message.text.trim();
    console.log(`💬 Text received from ${userProfile.userId}: "${userMessage.substring(0, 50)}..."`);

    // 1. ตรวจสอบคำสั่งพิเศษก่อน
    if (handleSpecialCommands(userMessage, replyToken, userProfile, credentials)) return;

    // 2. Gap 1: ตรวจสอบ Rate Limit
    if (!checkRateLimit(userProfile.userId)) {
      sendTextMessage(
        replyToken,
        `ป้าไพรขออภัยด้วยนะคะ วันนี้คุณพ่อคุณแม่หรือน้องๆ ส่งข้อความมาครบ ${APP_CONFIG.RATE_LIMIT_PER_DAY} ข้อความแล้วค่ะ\n\nหากมีคำถามเพิ่มเติม รบกวนติดต่อฝ่ายแนะแนวของโรงเรียนโดยตรงนะคะ 🙏\nหรือลองถามใหม่ได้พรุ่งนี้ค่ะ ✨`,
        credentials
      );
      return;
    }

    // 3. ประมวลผลด้วย AI
    processAIMessage(userMessage, replyToken, userProfile, credentials);

  } else {
    // รองรับเฉพาะ text เท่านั้น
    sendTextMessage(
      replyToken,
      'ป้าไพรขออภัยค่ะ ตอนนี้ป้าไพรรองรับเฉพาะการตอบคำถามด้วย "ข้อความ" เท่านั้นนะคะ\nพิมพ์คำถามทิ้งไว้ได้เลยค่ะ 📝',
      credentials
    );
  }
}

/**
 * ====================================
 * SPECIAL COMMANDS
 * คำสั่งพิเศษที่ตรวจก่อน AI pipeline เสมอ
 * ====================================
 */

function handleSpecialCommands(userMessage, replyToken, userProfile, credentials) {
  const command = userMessage.toLowerCase().trim();

  switch (command) {

    case '/clear':
    case 'clear':
      // Gap 8: ใช้ batch delete แทนการลบทีละแถว (อยู่ใน Config.gs)
      clearChatHistory(userProfile.userId);
      sendTextMessage(
        replyToken,
        '✅ ป้าไพรล้างความจำประวัติการสนทนาให้เรียบร้อยแล้วค่ะ\nเริ่มคุยเรื่องใหม่ได้เลยนะคะ 😊',
        credentials
      );
      return true;

    case '/help':
    case 'help':
      sendTextMessage(replyToken, buildHelpMessage(), credentials);
      return true;

    case '/refresh':
      // Admin command: ล้าง Knowledge Cache เพื่อดึงข้อมูล FAQ ใหม่ทันที
      // ใช้เมื่อ Staff อัปเดต FAQ_Data แล้วต้องการให้มีผลทันที
      forceRefreshKnowledgeCache();
      sendTextMessage(
        replyToken,
        '🔄 ป้าไพรล้าง Cache ข้อมูลหลักสูตรเรียบร้อยแล้วค่ะ\nข้อมูลชุดใหม่จะถูกโหลดในการตอบคำถามครั้งถัดไปนะคะ ✅',
        credentials
      );
      return true;

    default:
      return false;
  }
}

/**
 * สร้างข้อความ Help
 */
function buildHelpMessage() {
  return `🤖 คู่มือการใช้งาน PAPRAI PU-HSET

สวัสดีค่ะ ป้าไพรยินดีให้คำปรึกษาเกี่ยวกับ
หลักสูตรห้องเรียนพิเศษ PU-HSET ค่ะ 😊

📌 วิธีใช้งาน
━━━━━━━━━━━━━━━━━━━━━━

💬 พิมพ์คำถามได้เลยค่ะ เช่น
   • "ค่าเทอมเท่าไหร่"
   • "สายวิทย์สุขภาพเรียนอะไรบ้าง"
   • "รับนักเรียนกี่คน"
   • "แตกต่างจากห้องวิทย์ทั่วไปยังไง"

🔧 คำสั่งพิเศษ
━━━━━━━━━━━━━━━━━━━━━━

• /clear — ล้างประวัติการสนทนา
• /help  — แสดงคู่มือนี้

⚠️ หมายเหตุ
━━━━━━━━━━━━━━━━━━━━━━

ป้าไพรตอบได้สูงสุด ${APP_CONFIG.RATE_LIMIT_PER_DAY} คำถามต่อวันค่ะ

มีอะไรให้ป้าไพรช่วยอธิบายไหมคะ? 🎓`;
}

/**
 * ====================================
 * AI PROCESSING PIPELINE (RAG)
 * ขั้นตอน: Knowledge → History → Prompt → AI → Log → Reply
 * ====================================
 */

function processAIMessage(userMessage, replyToken, userProfile, credentials) {
  try {
    console.log(`🤖 Starting AI pipeline for user: ${userProfile.userId}`);

    // ขั้นที่ 1: Gap 4 — ดึง Knowledge Base ผ่าน Cache
    // (ดึงจาก Sheets เฉพาะเมื่อ Cache หมดอายุ ลด Sheets API calls)
    const retrievedContext = getKnowledgeWithCache();

    // ขั้นที่ 2: Gap 6 — ดึงประวัติการสนทนา (มี null guard แล้ว)
    const chatHistory = getChatHistory(userProfile.userId);

    // ขั้นที่ 3: สร้าง Prompt
    // Gap 3 — Fallback instruction ถูกต้อง (ห้ามใช้ความรู้ทั่วไป)
    const systemPrompt = getSystemPrompt();
    const userPrompt   = constructUserPrompt(chatHistory, retrievedContext, userMessage);

    // ขั้นที่ 4: เรียก LLM API
    // (ใช้ credentials.LLM_MODEL และ credentials.LLM_ENDPOINT จาก PropertiesService)
    const startAI   = new Date();
    const aiResponse = generateAIResponse(systemPrompt, userPrompt);
    const aiTime    = new Date() - startAI;
    console.log(`⏱️ LLM responded in ${aiTime}ms`);

    // ขั้นที่ 5: วิเคราะห์หมวดหมู่และประเมิน Tokens
    const category   = autoTagMessage(userMessage);
    const tokensUsed = estimateTokens(userMessage + aiResponse);

    // ขั้นที่ 6: Gap 2 — บันทึก Log (มี LockService แล้ว)
    saveChatHistory(userProfile, userMessage, aiResponse, category, tokensUsed);
    updateAnalytics(userProfile, category, tokensUsed);

    // ขั้นที่ 7: ส่งคำตอบกลับไปที่ LINE
    sendTextMessage(replyToken, aiResponse, credentials);
    console.log(`✅ AI pipeline complete (${aiTime}ms)`);

  } catch (error) {
    console.error('❌ AI pipeline error:', error);

    // สร้างข้อความ error ที่เหมาะสมตามประเภทของ error
    let errorMessage = 'ป้าไพรขออภัยค่ะ ขณะนี้ระบบกำลังขัดข้อง รบกวนลองพิมพ์ถามใหม่อีกครั้งในสักครู่นะคะ ⏳🙏';

    if (error.message.includes('API key invalid')) {
      errorMessage = 'ป้าไพรขออภัยค่ะ มีปัญหาในการเชื่อมต่อระบบ AI กรุณาติดต่อผู้ดูแลระบบนะคะ 🔧';
    } else if (error.message.includes('rate limit')) {
      errorMessage = 'ป้าไพรขออภัยค่ะ ระบบ AI มีผู้ใช้งานหนักมากในขณะนี้ รบกวนรอสักครู่แล้วลองใหม่อีกครั้งนะคะ ⏳';
    } else if (error.message.includes('LLM_MODEL') || error.message.includes('LLM_ENDPOINT')) {
      errorMessage = 'ป้าไพรขออภัยค่ะ ระบบยังตั้งค่าไม่สมบูรณ์ กรุณาติดต่อผู้ดูแลระบบนะคะ 🔧';
    }

    sendTextMessage(replyToken, errorMessage, credentials);
  }
}

/**
 * ====================================
 * LINE API FUNCTIONS
 * ====================================
 */

/**
 * ส่งข้อความ Text กลับไปที่ LINE
 * @param {string} replyToken - Token สำหรับ Reply
 * @param {string} text       - ข้อความที่จะส่ง
 * @param {object} credentials - Credentials object จาก getCredentials()
 */
function sendTextMessage(replyToken, text, credentials) {
  try {
    const url = 'https://api.line.me/v2/bot/message/reply';
    const options = {
      method:  'post',
      headers: {
        'Content-Type':  'application/json; charset=UTF-8',
        'Authorization': `Bearer ${credentials.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages:   [{ type: 'text', text: text }]
      }),
      muteHttpExceptions: true
    };

    const response     = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode !== 200) {
      console.error(`LINE Reply API Error (${responseCode}):`, response.getContentText());
    }

  } catch (error) {
    console.error('❌ Error sending text message:', error);
    throw error;
  }
}

/**
 * แสดง Loading Animation ในหน้าแชท
 * ให้ผู้ใช้รู้ว่าระบบกำลังประมวลผลอยู่
 */
function startLoading(userId, credentials) {
  try {
    const url = 'https://api.line.me/v2/bot/chat/loading/start';
    const options = {
      method:  'post',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${credentials.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      payload:            JSON.stringify({ chatId: userId }),
      muteHttpExceptions: true
    };
    UrlFetchApp.fetch(url, options);
    console.log('⏳ Loading indicator started');
  } catch (error) {
    // Loading indicator ไม่ใช่ฟังก์ชันหลัก ไม่ต้อง throw
    console.error('⚠️ Failed to start loading indicator:', error);
  }
}

/**
 * ====================================
 * EVENT HANDLERS
 * ====================================
 */

/**
 * ส่งข้อความต้อนรับเมื่อผู้ใช้ Add เพื่อนครั้งแรก
 */
function handleFollow(replyToken, credentials) {
  console.log('👋 New follower');
  const welcomeText = `สวัสดีค่ะ ยินดีต้อนรับเข้าสู่บริการถาม-ตอบ 🎓✨

หลักสูตรห้องเรียนพิเศษ
เตรียมอุดมวิทยาศาสตร์สุขภาพ และวิศวกรรมเทคโนโลยี
(PU-HSET)

โรงเรียนสาธิต มหาวิทยาลัยศิลปากร (มัธยมศึกษา)

━━━━━━━━━━━━━━━━━━━━━━

ฉันคือ "ป้าไพร" AI ผู้ช่วยแนะแนวประจำหลักสูตรค่ะ 😊

คุณพ่อคุณแม่หรือนักเรียนสามารถพิมพ์คำถาม
ที่สงสัยได้เลยนะคะ เช่น

📌 "ค่าเทอมเท่าไหร่"
📌 "สายวิทย์สุขภาพกับวิศวะต่างกันยังไง"
📌 "จบแล้วเรียนต่อสาขาไหนได้บ้าง"

ป้าไพรพร้อมให้ข้อมูลค่ะ 🙏`;

  sendTextMessage(replyToken, welcomeText, credentials);
}

/**
 * ====================================
 * UTILITY FUNCTIONS
 * ====================================
 */

/**
 * สร้าง HTTP Response สำหรับ doPost
 * หมายเหตุ: ContentService ใน GAS ไม่รองรับ setStatusCode()
 * จึง return status 200 เสมอ (LINE Platform ไม่ได้อ่าน status code จาก webhook response)
 */
function createResponse(data) {
  const output = typeof data === 'string' ? { message: data } : data;
  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ประมาณการ Tokens ที่ใช้ (สำหรับบันทึกสถิติ)
 * ภาษาไทย: ~1 คำ ≈ 2-3 tokens / ใช้ 2.5 เป็นค่ากลาง
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 2.5);
}
