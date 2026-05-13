#!/usr/bin/env node
/**
 * Telegram Anti-Age / Biohacking / Nutrition Auto-Post Agent
 * Запуск: node agent.js
 * Расписание: cron или встроенный планировщик (см. README)
 */

const https = require('https');
const http = require('http');
const { XMLParser } = require('fast-xml-parser');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// ─── Хранилище опубликованных постов (JSON-файл) ───────────────────────────
const DB_FILE = path.join(__dirname, 'published.json');

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { posts: [], keywords: [] };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getTodayCount(db) {
  const today = new Date().toISOString().slice(0, 10);
  return db.posts.filter(p => p.date === today).length;
}

// ─── RSS-источники ──────────────────────────────────────────────────────────
const RSS_FEEDS = [
  // ── Научные и медицинские источники ────────────────────────────────────────
  {
    name: 'Peter Attia – The Drive',
    url: 'https://peterattiamd.com/feed/',
    topic: 'longevity',
  },
  {
    name: 'Huberman Lab',
    url: 'https://feeds.libsyn.com/254981/rss',
    topic: 'biohacking',
  },
  {
    name: 'NIH News in Health',
    url: 'https://newsinhealth.nih.gov/rss/news',
    topic: 'wellbeing',
  },
  {
    name: 'ScienceDaily – Anti-Aging',
    url: 'https://www.sciencedaily.com/rss/health_medicine/aging.xml',
    topic: 'anti-age',
  },
  {
    name: 'ScienceDaily – Nutrition',
    url: 'https://www.sciencedaily.com/rss/health_medicine/nutrition.xml',
    topic: 'nutrition',
  },
  {
    name: 'ScienceDaily – Fitness',
    url: 'https://www.sciencedaily.com/rss/health_medicine/fitness.xml',
    topic: 'wellbeing',
  },
  {
    name: 'Medical News Today – Nutrition',
    url: 'https://www.medicalnewstoday.com/rss/nutrition.xml',
    topic: 'nutrition',
  },
  {
    name: 'Medical News Today – Longevity',
    url: 'https://www.medicalnewstoday.com/rss/longevity.xml',
    topic: 'longevity',
  },
  {
    name: 'Longevity Technology',
    url: 'https://www.longevity.technology/feed/',
    topic: 'anti-age',
  },
  {
    name: 'Dave Asprey – Bulletproof',
    url: 'https://daveasprey.com/feed/',
    topic: 'biohacking',
  },
  {
    name: 'Examine – Supplement Research',
    url: 'https://examine.com/feed/',
    topic: 'nutrition',
  },
  // ── Гаджеты и технологии ───────────────────────────────────────────────────
  {
    name: 'Oura Ring Blog',
    url: 'https://ouraring.com/blog/feed/',
    topic: 'gadgets',
  },
  {
    name: 'Whoop Blog',
    url: 'https://www.whoop.com/thelocker/feed/',
    topic: 'gadgets',
  },
  {
    name: 'Levels Health Blog',
    url: 'https://www.levelshealth.com/blog/rss.xml',
    topic: 'gadgets',
  },
  {
    name: 'Ultrahuman Blog',
    url: 'https://www.ultrahuman.com/blog/rss.xml',
    topic: 'gadgets',
  },
  {
    name: 'Eight Sleep Blog',
    url: 'https://www.eightsleep.com/blog/rss/',
    topic: 'gadgets',
  },
  {
    name: 'Wareable – Wearable Tech',
    url: 'https://www.wareable.com/feed/rss',
    topic: 'gadgets',
  },
  {
    name: 'Gadgets & Wearables',
    url: 'https://gadgetsandwearables.com/feed/',
    topic: 'gadgets',
  },
  // ── БАДы и суперфуды ───────────────────────────────────────────────────────
  {
    name: 'Nootropics Depot Blog',
    url: 'https://blog.nootropicsdepot.com/feed/',
    topic: 'supplements',
  },
  {
    name: 'Precision Nutrition',
    url: 'https://www.precisionnutrition.com/feed',
    topic: 'supplements',
  },
  {
    name: 'Healthline – Nutrition',
    url: 'https://www.healthline.com/rss/nutrition',
    topic: 'supplements',
  },
  {
    name: 'Natural Medicine Journal',
    url: 'https://www.naturalmedicinejournal.com/rss.xml',
    topic: 'supplements',
  },
  // ── Бег и марафоны ─────────────────────────────────────────────────────────
  {
    name: 'World Athletics News',
    url: 'https://worldathletics.org/news/rss.xml',
    topic: 'running',
  },
  {
    name: 'iRunFar – Trail Running',
    url: 'https://www.irunfar.com/feed',
    topic: 'running',
  },
  {
    name: 'Trail Runner Magazine',
    url: 'https://www.trailrunnermag.com/feed/',
    topic: 'running',
  },
  {
    name: 'Runner\'s World',
    url: 'https://www.runnersworld.com/feeds/all',
    topic: 'running',
  },
  {
    name: 'Ultra168 – Trail & Ultra',
    url: 'https://ultra168.com/feed/',
    topic: 'running',
  },
  // ── Wellness клубы и люкс-велнес ──────────────────────────────────────────
  {
    name: 'Well+Good',
    url: 'https://www.wellandgood.com/feed/',
    topic: 'wellness',
  },
  {
    name: 'Spa Business',
    url: 'https://www.spabusiness.com/rss/',
    topic: 'wellness',
  },
  {
    name: 'Robb Report – Health',
    url: 'https://robbreport.com/feed/',
    topic: 'wellness',
  },
  // ── Интегративная медицина ─────────────────────────────────────────────────
  {
    name: 'Integrative Medicine – IMCJ',
    url: 'https://www.imjournal.com/rss/',
    topic: 'integrative',
  },
  {
    name: 'Andrew Weil – Integrative Medicine',
    url: 'https://www.drweil.com/feed/',
    topic: 'integrative',
  },
  {
    name: 'Functional Medicine University',
    url: 'https://www.functionalmedicineuniversity.com/feed',
    topic: 'integrative',
  },
];

// Ключевые слова для фильтрации релевантных статей
const KEYWORDS = [
  // Антивозрастное / долголетие
  'longevity', 'anti-aging', 'antiaging', 'aging', 'lifespan', 'healthspan',
  'senescence', 'telomere', 'epigenetics', 'autophagy', 'stem cell',
  'rapamycin', 'metformin', 'resveratrol', 'senolytics',
  // Биохакинг и интегративная медицина
  'biohacking', 'HRV', 'cold therapy', 'sauna', 'red light', 'photobiomodulation',
  'fasting', 'intermittent fasting', 'time-restricted', 'circadian',
  'integrative medicine', 'functional medicine', 'personalized medicine',
  'peptide', 'hormone therapy', 'IV therapy', 'ozone therapy',
  // БАДы и суперфуды
  'supplement', 'superfood', 'nutraceutical', 'adaptogen',
  'omega-3', 'vitamin D', 'vitamin', 'magnesium', 'collagen', 'protein',
  'NMN', 'NAD', 'quercetin', 'berberine', 'probiotics', 'prebiotics',
  'antioxidant', 'polyphenol', 'nootropic', 'ashwagandha', 'creatine',
  'spermidine', 'urolithin', 'coenzyme', 'glutathione', 'lion\'s mane',
  'mushroom', 'spirulina', 'moringa', 'matcha', 'turmeric', 'ginger',
  // Метаболизм и здоровье
  'mitochondria', 'mTOR', 'glucose', 'insulin', 'metabolic', 'metabolism',
  'hormone', 'testosterone', 'estrogen', 'thyroid', 'cortisol',
  'microbiome', 'gut health', 'inflammation', 'anti-inflammatory',
  // Гаджеты и технологии
  'wearable', 'tracker', 'biosensor', 'oura', 'whoop', 'ultrahuman',
  'CGM', 'continuous glucose', 'heart rate variability', 'sleep tracker',
  'red light therapy', 'PEMF', 'neurofeedback', 'cold plunge',
  'hyperbaric', 'infrared sauna', 'smart ring', 'health monitor',
  // Бег и марафоны
  'marathon', 'trail running', 'ultramarathon', 'trail run',
  'UTMB', 'Western States', 'Leadville', 'Comrades', 'Boston Marathon',
  'Tokyo Marathon', 'Berlin Marathon', 'Chicago Marathon', 'London Marathon',
  'New York Marathon', 'Abbott World Marathon Majors', 'world record',
  'трейл', 'марафон', 'ультрамарафон', 'бег', 'забег',
  // Wellness клубы и люкс-велнес
  'wellness club', 'luxury wellness', 'longevity clinic', 'health retreat',
  'biohacking center', 'longevity center', 'wellness resort',
  'executive health', 'concierge medicine', 'spa longevity',
  'Six Senses', 'SHA Wellness', 'Canyon Ranch', 'Chiva-Som',
  // Общее здоровье
  'wellbeing', 'well-being', 'mental health', 'cognitive', 'brain health',
  'sleep', 'exercise', 'fitness', 'strength', 'cardiovascular', 'recovery',
];

// ─── HTTP fetch с таймаутом ─────────────────────────────────────────────────
function fetchUrl(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: timeoutMs,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── Парсинг RSS ────────────────────────────────────────────────────────────
function parseRSS(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '_' });
  try {
    const result = parser.parse(xml);
    const channel = result?.rss?.channel || result?.feed;
    if (!channel) return [];

    // Поддержка Atom и RSS
    const rawItems = channel.item || channel.entry || [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    return items.map(item => ({
      title: stripHTML(item.title || ''),
      description: stripHTML(item.description || item.summary || item.content || ''),
      link: item.link?._href || item.link || item.guid || '',
      pubDate: item.pubDate || item.published || item.updated || new Date().toISOString(),
    })).filter(item => item.title && item.link);
  } catch (e) {
    return [];
  }
}

function stripHTML(str) {
  return String(str)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

// ─── Проверка релевантности ─────────────────────────────────────────────────
function isRelevant(item) {
  const text = (item.title + ' ' + item.description).toLowerCase();
  return KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

// ─── Проверка дублей ────────────────────────────────────────────────────────
function isDuplicate(item, db) {
  const titleWords = item.title.toLowerCase().split(/\W+/).filter(w => w.length > 4);

  for (const pub of db.posts) {
    // Точное совпадение URL
    if (pub.url === item.link) return true;

    // Совпадение > 60% слов заголовка
    const pubWords = (pub.title || '').toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const common = titleWords.filter(w => pubWords.includes(w));
    if (titleWords.length > 0 && common.length / titleWords.length > 0.6) return true;
  }
  return false;
}

// ─── Генерация поста через Groq (бесплатно, быстро, качественно) ────────────
async function generatePost(item, sourceName, topic) {
  const prompt = `Ты — опытный редактор русскоязычного Telegram-канала об anti-age, биохакинге, долголетии, нутрициологии и well-being для состоятельной аудитории.

ЗАДАЧА: Напиши качественный пост для Telegram на ЧИСТОМ РУССКОМ ЯЗЫКЕ.

ТЕМА ПОСТА: ${topic}
${topic === 'running' ? '⚡ Это пост о беге/марафоне — укажи результаты, имена победителей, рекорды, дистанцию. Обязательно добавь хэштег #UTMB если речь о трейл-раннинге или горных забегах.' : ''}
${topic === 'gadgets' ? '⌚ Это пост о гаджете/устройстве — опиши что делает, для кого, чем полезен для здоровья.' : ''}
${topic === 'supplements' ? '💊 Это пост о БАД/суперфуде — опиши исследования, дозировки, эффекты, для кого подходит.' : ''}
${topic === 'wellness' ? '🏛 Это пост о велнес-клубе/retreate — акцент на уникальности, аудитории, подходе к longevity.' : ''}
${topic === 'integrative' ? '🔬 Это пост об интегративной медицине — объясни метод, доказательную базу, применение.' : ''}

ТРЕБОВАНИЯ:
- Язык: грамотный живой русский, как пишет умный друг-врач
- Длина: 500–800 символов
- Структура: эмодзи + **жирный заголовок** → 2-3 факта → призыв → хэштеги
- Факты: только из статьи, не придумывай
- Хэштеги: 3-4 штуки в конце
- НЕ включай URL

ПРИМЕР:
🧬 **Сауна 4 раза в неделю снижает риск деменции на 65%**

Финские учёные наблюдали 2000 человек 20 лет. Те, кто ходил в сауну 4-7 раз в неделю, болели Альцгеймером на 65% реже.

Механизм: высокая температура запускает белки теплового шока, защищающие нейроны. Плюс улучшается кровоток в мозге.

15-20 минут при 80°C — и ваш мозг говорит спасибо 🙏

#долголетие #биохакинг #здоровьемозга #longevity

---
Заголовок статьи: ${item.title}
Краткое содержание: ${item.description}
Источник: ${sourceName}

Верни ТОЛЬКО текст поста. Никаких пояснений.`;

  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
    temperature: 0.7,
  });

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => { chunks.push(chunk); });
      res.on('end', () => {
        try {
          const data = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          const text = parsed.choices?.[0]?.message?.content;
          if (!text) return reject(new Error('Пустой ответ от Groq'));
          resolve(text.trim());
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Отправка в Telegram ────────────────────────────────────────────────────
function sendTelegramMessage(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: config.TELEGRAM_CHANNEL_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      link_preview_options: { is_disabled: false },
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) resolve(parsed);
          else reject(new Error(`Telegram error: ${parsed.description}`));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Форматирование финального поста (HTML) ────────────────────────────────
function formatFinalPost(generatedText, item, sourceName) {
  // Убираем артефакты кодировки и лишние символы
  let text = generatedText
    .replace(/\uFFFD/g, '')           // убираем символ замены (кракозябры)
    .replace(/[\u0080-\u009F]/g, '')  // убираем управляющие символы
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')  // **жирный** → <b>жирный</b>
    .replace(/\*(.+?)\*/g, '<i>$1</i>')      // *курсив* → <i>курсив</i>
    .replace(/&/g, '&amp;')           // экранируем HTML
    .replace(/</g, '&lt;')            // но только вне тегов
    .replace(/>/g, '&gt;')
    .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
    .replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>')
    .trim();

  return `${text}\n\n🔗 <a href="${item.link}">${sourceName}</a>`;
}

// ─── Задержка ───────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Логирование ────────────────────────────────────────────────────────────
function log(msg, level = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);

  const logFile = path.join(__dirname, 'agent.log');
  fs.appendFileSync(logFile, line + '\n');
}

// ─── Главная функция ────────────────────────────────────────────────────────
async function runAgent() {
  log('═══ Агент запущен ═══');

  const db = loadDB();
  const todayCount = getTodayCount(db);
  const remaining = config.MAX_POSTS_PER_DAY - todayCount;

  log(`Опубликовано сегодня: ${todayCount}/${config.MAX_POSTS_PER_DAY}`);

  if (remaining <= 0) {
    log('Дневной лимит публикаций достигнут. Агент завершает работу.', 'WARN');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let published = 0;

  // Перемешиваем источники для равномерного охвата
  const feeds = [...RSS_FEEDS].sort(() => Math.random() - 0.5);

  for (const feed of feeds) {
    if (published >= remaining) break;

    log(`Читаю RSS: ${feed.name}`);

    let xml;
    try {
      xml = await fetchUrl(feed.url);
    } catch (e) {
      log(`Ошибка получения ${feed.name}: ${e.message}`, 'WARN');
      continue;
    }

    const items = parseRSS(xml);
    log(`  Найдено статей: ${items.length}`);

    // Фильтруем: релевантные и свежие (последние 30 дней)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const candidates = items.filter(item => {
      const pub = new Date(item.pubDate);
      return !isNaN(pub) ? pub > cutoff : true;
    }).filter(isRelevant);

    log(`  Релевантных и свежих: ${candidates.length}`);

    for (const item of candidates) {
      if (published >= remaining) break;

      // Проверка дубля
      if (isDuplicate(item, db)) {
        log(`  Дубль пропущен: "${item.title.slice(0, 60)}"`);
        continue;
      }

      log(`  Генерирую пост: "${item.title.slice(0, 60)}"`);

      // Пауза перед запросом к AI (защита от rate limit)
      await sleep(10000);

      let postText;
      try {
        postText = await generatePost(item, feed.name, feed.topic);
      } catch (e) {
        log(`  Ошибка генерации: ${e.message}`, 'ERROR');
        continue;
      }

      const finalText = formatFinalPost(postText, item, feed.name);

      // Публикация
      if (config.DRY_RUN) {
        log(`  [DRY RUN] Пост НЕ отправлен (DRY_RUN=true)`);
        log(`  Текст поста:\n${finalText}\n`);
      } else {
        try {
          await sendTelegramMessage(finalText);
          log(`  ✓ Опубликовано в Telegram`);
        } catch (e) {
          log(`  Ошибка Telegram: ${e.message}`, 'ERROR');
          continue;
        }
      }

      // Сохраняем в базу
      db.posts.push({
        title: item.title,
        url: item.link,
        source: feed.name,
        topic: feed.topic,
        date: today,
        publishedAt: new Date().toISOString(),
      });
      saveDB(db);

      published++;
      log(`  Постов опубликовано в эту сессию: ${published}`);

      // Пауза между постами (чтобы не спамить)
      if (published < remaining) {
        const delayMs = config.DELAY_BETWEEN_POSTS_MIN * 60 * 1000;
        log(`  Ожидание ${config.DELAY_BETWEEN_POSTS_MIN} мин. до следующего поста...`);
        await sleep(delayMs);
      }
    }
  }

  log(`═══ Агент завершил работу. Опубликовано: ${published} постов ═══`);
}

// ─── Встроенный планировщик ─────────────────────────────────────────────────
function startScheduler() {
  log('Планировщик запущен. Агент будет запускаться по расписанию.');

  // Парсим расписание из config: "09:00,14:00,19:00"
  const times = config.SCHEDULE_TIMES.split(',').map(t => t.trim());

  async function checkAndRun() {
    const now = new Date();
    const hhmm = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    if (times.includes(hhmm)) {
      await runAgent();
    }
  }

  // Проверяем каждую минуту
  setInterval(checkAndRun, 60 * 1000);
  log(`Расписание: ${times.join(', ')}`);
}

// ─── Точка входа ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--run-now')) {
  runAgent().catch(e => { log(e.message, 'ERROR'); process.exit(1); });
} else if (args.includes('--schedule')) {
  startScheduler();
} else {
  console.log(`
Использование:
  node agent.js --run-now      Запустить агента немедленно
  node agent.js --schedule     Запустить с планировщиком по расписанию из config.js
  `);
}
