// Dated context the dashboard does not measure itself: who decides what is blocked, and who has
// privileged access. The page sorts it newest first and writes the dates itself (Persian calendar
// in Farsi), so a new development is one new entry here:
//   - `panel`: 'control' (who decides) or 'privileged' (privileged access);
//   - `date` (and `until` for a span): 'YYYY-MM-DD', or 'YYYY-MM' when only the month is known;
//     the entry is sorted by its latest date;
//   - `text`: English and Farsi, without a leading date; Farsi must not begin with a Latin word;
//   - `sources`: keys of CONTEXT_SOURCES, each with its own URL, name and publication date;
//   - `added` (optional): the day it was added; the page marks it "new" for 30 days.
// Primary or named first-hand sources only, never Wikipedia. Update CONTEXT_CHECKED whenever the
// entries are checked against their sources again. tests/context-items.test.mjs checks the rules.

export const CONTEXT_CHECKED = '2026-09-25';

export const CONTEXT_SOURCES = {
  rferlBill: { url: 'https://www.rferl.org/a/iran-internet-bill-restriction-access/33845516.html', date: '2026-09-03', name: { en: 'RFE/RL', fa: 'رادیو فردا' } },
  bloomberg: { url: 'https://www.bloomberg.com/features/2026-iran-internet/', date: '2026-09-15', name: { en: 'Bloomberg', fa: 'بلومبرگ' } },
  factnameh: { url: 'https://factnameh.substack.com/p/who-controls-irans-internet-the-clash', date: '2026-05-29', name: { en: 'Factnameh (ASL19)', fa: 'فکت‌نامه (ASL19)' } },
  isnaEnd: { url: 'https://avash.ir/%D8%A8%D8%AE%D8%B4-%D8%A7%D8%AC%D8%AA%D9%85%D8%A7%D8%B9%DB%8C-5/90932-%D8%A7%DB%8C%D9%86%D8%AA%D8%B1%D9%86%D8%AA-%D9%BE%D8%B1%D9%88-%D8%AD%D8%B0%D9%81-%D8%B4%D8%AF', date: '2026-05-25', name: { en: 'ISNA via Avash', fa: 'ایسنا به نقل آوش' } },
  aljazeeraMay: { url: 'https://www.aljazeera.com/editorial/2026/5/14/iran-expands-tiered-internet-access-amid-continued-online-blackout', date: '2026-05-14', name: { en: 'Al Jazeera', fa: 'الجزیره' } },
  cnn: { url: 'https://www.cnn.com/2026/05/10/middleeast/iran-internet-pro-blackout-access-vpn-intl', date: '2026-05-10', name: { en: 'CNN', fa: 'سی‌ان‌ان' } },
  iranintlApr: { url: 'https://www.iranintl.com/en/202604203889', date: '2026-04-20', name: { en: 'Iran International', fa: 'ایران اینترنشنال' } },
  filterwatchApr: { url: 'https://filter.watch/english/2026/04/20/nvestigative-report-april-2026-from-the-open-internet-to-internet-sovereignty/', date: '2026-04-20', name: { en: 'Filterwatch', fa: 'فیلترواچ' } },
  parsineMar: { url: 'https://www.parsine.com/%D8%A8%D8%AE%D8%B4-%D8%AF%D8%A7%D9%86%D8%B4-%D9%81%D9%86%D8%A7%D9%88%D8%B1%DB%8C-140/975688-%D8%B3%DB%8C%D9%85-%DA%A9%D8%A7%D8%B1%D8%AA-%D9%87%D8%A7%DB%8C-%D8%B3%D9%81%DB%8C%D8%AF-%D9%87%D9%85-%D9%82%D8%B7%D8%B9-%D8%B4%D8%AF%D9%86%D8%AF', date: '2026-03-15', name: { en: 'Parsine, citing NetBlocks', fa: 'پارسینه به نقل نت‌بلاکس' } },
  iranintlMar: { url: 'https://www.iranintl.com/en/202603106004', date: '2026-03-10', name: { en: 'Iran International', fa: 'ایران اینترنشنال' } },
  euRegulation: { url: 'https://eur-lex.europa.eu/eli/reg_impl/2026/267/oj', date: '2026-01-29', name: { en: 'EU Regulation 2026/267', fa: 'مقررات اتحادیهٔ اروپا ۲۰۲۶/۲۶۷' } },
  euCouncil: { url: 'https://www.consilium.europa.eu/en/press/press-releases/2026/01/29/iran-council-adopts-new-sanctions-over-serious-human-rights-violations-and-iran-s-continued-support-to-russia-s-war-of-aggression-against-ukraine/', date: '2026-01-29', name: { en: 'Council of the EU', fa: 'شورای اتحادیهٔ اروپا' } },
  entekhab: { url: 'https://www.entekhab.ir/fa/news/905154/', date: '2026-01-16', name: { en: 'Entekhab', fa: 'انتخاب' } },
  // Our own measurement of the January 2026 shutdown (the timeline and the networks table).
  measuredJanuary: { url: '/?asn=ALL&since=2026-01-05&until=2026-01-20#anatomy-title', date: '2026-01-15', internal: true, name: { en: 'Measured on this page (Cloudflare Radar)', fa: 'اندازه‌گیری‌شده در همین صفحه (Cloudflare Radar)' } },
  ban: { url: 'https://thenewregion.com/posts/3922', date: '2025-12-11', name: { en: 'The New Region', fa: 'نیو ریجن' } },
  khabarfoori: { url: 'https://www.khabarfoori.com/%D8%A8%D8%AE%D8%B4-%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF%DB%8C-145/3179541-%D8%B3%DB%8C%D9%85%DA%A9%D8%A7%D8%B1%D8%AA-%D8%B3%D9%81%DB%8C%D8%AF-%D9%85%D8%B5%D9%88%D8%A8%D9%87-%DA%86%D9%87-%D9%85%D8%B1%D8%AC%D8%B9%DB%8C-%D8%A8%D9%88%D8%AF-%DA%86%D8%B1%D8%A7-%D8%AA%D8%B9%D8%AF%D8%A7%D8%AF-%D8%A2%D9%86%D9%87%D8%A7-%D8%AF%D8%B1-%D8%AF%D9%88%D9%84%D8%AA-%DA%86%D9%87%D8%A7%D8%B1%D8%AF%D9%87%D9%85-%DA%A9%D8%A7%D9%87%D8%B4-%DB%8C%D8%A7%D9%81%D8%AA', date: '2025-11-27', name: { en: 'Khabar Foori', fa: 'خبر فوری' } },
  zoomit: { url: 'https://www.zoomit.ir/tech-iran/452713-iran-classified-internet-white-sim-cards/', date: '2025-11-26', name: { en: 'Zoomit', fa: 'زومیت' } },
  iranintlNov: { url: 'https://www.iranintl.com/en/202511248487', date: '2025-11-24', name: { en: 'Iran International', fa: 'ایران اینترنشنال' } },
  citizenlab: { url: 'https://citizenlab.ca/research/uncovering-irans-mobile-legal-intercept-system/', date: '2023-01-16', name: { en: 'Citizen Lab', fa: 'سیتیزن لب' } },
};

export const CONTEXT_ITEMS = [
  // Who decides what is blocked
  {
    id: 'bill', panel: 'control', date: '2026-08-26', sources: ['rferlBill'],
    text: {
      en: 'A “Cyberspace Regulation Plan” went to parliament. It hands control of Iran’s internet gateways to the Supreme Council of Cyberspace, obliges providers to identify every user, and requires foreign platforms to have a presence in Iran. The ICT ministry opposes it; no vote date is set.',
      fa: '«طرح تنظیم فضای مجازی» به مجلس رفت. این طرح کنترل درگاه‌های اینترنت ایران را به شورای عالی فضای مجازی می‌سپارد، ارائه‌دهندگان را به احراز هویت هر کاربر ملزم می‌کند و از پلتفرم‌های خارجی حضور در ایران می‌خواهد. وزارت ارتباطات با آن مخالف است؛ زمان رأی‌گیری تعیین نشده است.',
    },
  },
  {
    id: 'taskForce', panel: 'control', date: '2026-05-12', until: '2026-05-26', sources: ['factnameh'],
    text: {
      en: 'The president set up a 15-member “Special Task Force for Organizing and Guiding the Country’s Cyberspace”, chaired by the first vice president. On 25 May it voted 9 to 2 to return the internet to its state before January; on 26 May the Court of Administrative Justice suspended its decisions pending review. The reopening went ahead: traffic began to return on 26 May at 16:30 Tehran time (measured on this page). Whether such a body answers to the courts or to the Supreme National Security Council is disputed.',
      fa: 'رئیس‌جمهور «ستاد ویژهٔ ساماندهی فضای مجازی» را با ۱۵ عضو و به ریاست معاون اول تشکیل داد. این ستاد در ۴ خرداد با ۹ رأی در برابر ۲ رأی به بازگرداندن اینترنت به وضعیت پیش از دی رأی داد؛ در ۵ خرداد دیوان عدالت اداری تصمیم‌های آن را تا رسیدگی متوقف کرد. بازگشایی ادامه یافت: ترافیک در ۵ خرداد ساعت ۱۶:۳۰ به وقت تهران شروع به بازگشت کرد (اندازه‌گیری‌شده در همین صفحه). اینکه چنین نهادی پاسخ‌گوی دادگاه‌هاست یا شورای عالی امنیت ملی، محل اختلاف است.',
    },
  },
  {
    id: 'filtering', panel: 'control', date: '2026-01-29', sources: ['euRegulation', 'euCouncil'],
    text: {
      en: 'The EU sanctioned the body that decides what is filtered, the Working Group for Determining Instances of Criminal Content (also called the Filtering Committee), which works under the Attorney General’s Office and the Ministry of Justice. According to the EU, the tools it has built with companies reduce bandwidth, block international social media and block unauthorised VPNs.',
      fa: 'اتحادیهٔ اروپا نهادی را تحریم کرد که تعیین می‌کند چه چیزی فیلتر شود: کارگروه تعیین مصادیق محتوای مجرمانه (معروف به کمیتهٔ فیلترینگ) که زیر نظر دادستانی کل کشور و وزارت دادگستری کار می‌کند. به گفتهٔ اتحادیهٔ اروپا، ابزارهایی که این کارگروه با شرکت‌ها ساخته پهنای باند را کاهش می‌دهند، شبکه‌های اجتماعی بین‌المللی را مسدود می‌کنند و وی‌پی‌ان‌های غیرمجاز را می‌بندند.',
    },
  },
  {
    id: 'contractors', panel: 'control', date: '2026-01-29', sources: ['euRegulation'],
    text: {
      en: 'The same EU act names two companies that build these tools: Yaftar (blocking of websites, apps and VPNs, together with the Attorney General’s Office) and Douran Software Technologies (traffic analysis, filtering and VPN-blocking equipment for Iranian internet providers, and National Information Network projects).',
      fa: 'همان سند اتحادیهٔ اروپا دو شرکت سازندهٔ این ابزارها را نام می‌برد: یافتار (مسدودسازی وب‌سایت‌ها، اپلیکیشن‌ها و وی‌پی‌ان‌ها، همراه با دادستانی کل کشور) و گروه دوران (تحلیل ترافیک، فیلترینگ و تجهیزات مسدودسازی وی‌پی‌ان برای ارائه‌دهندگان اینترنت ایران، و پروژه‌های شبکهٔ ملی اطلاعات).',
    },
  },
  {
    id: 'satra', panel: 'control', date: '2026-01-29', sources: ['euRegulation'],
    text: {
      en: 'The same act lists SATRA, which oversees online video and streaming content under the state broadcaster IRIB and censors political and cultural content.',
      fa: 'همین سند ساترا را هم فهرست می‌کند که زیر نظر صداوسیما بر محتوای ویدئویی و پخش آنلاین نظارت دارد و محتوای سیاسی و فرهنگی را سانسور می‌کند.',
    },
  },
  {
    id: 'shutdownOrder', panel: 'control', date: '2026-01-16', sources: ['entekhab', 'factnameh'],
    text: {
      en: 'No official statement named the body that ordered the nationwide shutdown of 8 January 2026. In June 2025 the ICT ministry cited “competent authorities”; in November 2019 the ICT minister said the Country Security Council, chaired by the interior minister, had ordered the shutdown. The Supreme Council of Cyberspace sets internet policy but cannot itself switch the internet off.',
      fa: 'هیچ بیانیهٔ رسمی نهادی را که دستور قطع سراسری اینترنت در ۱۸ دی ۱۴۰۴ را داد نام نبرد. در خرداد ۱۴۰۴ وزارت ارتباطات از «مراجع ذی‌صلاح» سخن گفت؛ در آبان ۱۳۹۸ وزیر ارتباطات گفت قطع اینترنت به دستور شورای امنیت کشور، به ریاست وزیر کشور، بوده است. شورای عالی فضای مجازی سیاست‌های اینترنت را تعیین می‌کند اما خود اختیار قطع اینترنت را ندارد.',
    },
  },
  {
    id: 'gateway', panel: 'control', date: '2026-01-09', until: '2026-01-15', sources: ['measuredJanuary'],
    text: {
      en: 'In the first week of the nationwide shutdown, the state gateway company TIC (AS49666), through which international traffic passes, carried 35% of the little traffic left, against under 0.1% in the week before.',
      fa: 'در هفتهٔ نخست قطعی سراسری، شرکت دولتی ارتباطات زیرساخت (TIC، AS49666) که ترافیک بین‌المللی از آن می‌گذرد، ۳۵٪ از ترافیک اندک باقی‌مانده را حمل می‌کرد، در برابر کمتر از ۰٫۱٪ در هفتهٔ پیش از آن.',
    },
  },

  // Privileged access
  {
    id: 'bloomberg', panel: 'privileged', date: '2026-09-15', sources: ['bloomberg'],
    text: {
      en: 'Bloomberg’s investigation describes the result: most people stay on a controlled national network while an elite keeps privileged access to the global internet.',
      fa: 'گزارش تحقیقی بلومبرگ نتیجه را توصیف می‌کند: بیشتر مردم در یک شبکهٔ ملی کنترل‌شده می‌مانند و یک نخبهٔ کوچک دسترسی ویژه به اینترنت جهانی دارد.',
    },
  },
  {
    id: 'internetProEnd', panel: 'privileged', date: '2026-05-25', sources: ['isnaEnd'],
    text: {
      en: 'MCI removed the Internet Pro page from its website, after the government’s cyberspace task force decided to restore international internet access.',
      fa: 'همراه اول صفحهٔ اینترنت پرو را از وب‌سایت خود برداشت؛ پس از آن‌که ستاد ویژهٔ فضای مجازی دولت دربارهٔ بازگرداندن دسترسی به اینترنت بین‌الملل تصمیم گرفت.',
    },
  },
  {
    id: 'internetPro', panel: 'privileged', date: '2026-02', until: '2026-05', sources: ['iranintlApr', 'aljazeeraMay'],
    text: {
      en: '“Internet Pro”, approved by the Supreme National Security Council, sold global access during the shutdown: first to holders of a commercial card through the Chamber of Commerce, then to businesses, university staff and lawyers, after identity checks.',
      fa: '«اینترنت پرو» با تصویب شورای عالی امنیت ملی، در دوران قطعی دسترسی جهانی می‌فروخت: نخست به دارندگان کارت بازرگانی از طریق اتاق بازرگانی، سپس به کسب‌وکارها، کادر دانشگاه‌ها و وکلا، پس از احراز هویت.',
    },
  },
  {
    id: 'services', panel: 'privileged', date: '2026-04-04', until: '2026-05-14', sources: ['filterwatchApr', 'aljazeeraMay'],
    text: {
      en: 'What Internet Pro opened: on 4 April WhatsApp worked and Telegram did not (Filterwatch test); by 14 May Telegram, WhatsApp and ChatGPT were reachable, while YouTube and nearly all other international services stayed blocked.',
      fa: 'آنچه اینترنت پرو باز می‌کرد: در ۱۵ فروردین واتس‌اپ کار می‌کرد و تلگرام نه (آزمون فیلترواچ)؛ تا ۲۴ اردیبهشت تلگرام، واتس‌اپ و چت‌جی‌پی‌تی در دسترس بودند و یوتیوب و تقریباً همهٔ دیگر سرویس‌های بین‌المللی مسدود ماندند.',
    },
  },
  {
    id: 'price', panel: 'privileged', date: '2026-05-10', sources: ['cnn'],
    text: {
      en: 'Price of an Internet Pro line: 2.8 million toman activation, 2 million toman for 50 GB a year and about 40,000 toman per extra GB; lines were resold on the black market at several times that.',
      fa: 'قیمت یک خط اینترنت پرو: ۲٫۸ میلیون تومان فعال‌سازی، ۲ میلیون تومان برای ۵۰ گیگابایت در سال و حدود ۴۰ هزار تومان برای هر گیگابایت اضافه؛ این خطوط در بازار سیاه به چند برابر این قیمت فروخته شدند.',
    },
  },
  {
    id: 'gatewayCut', panel: 'privileged', date: '2026-03-15', sources: ['parsineMar'],
    text: {
      en: 'NetBlocks measured a connectivity collapse at AS12880, Iran’s international gateway; the last one per cent of international connectivity, used by privileged lines, went offline.',
      fa: 'نت‌بلاکس فروپاشی اتصال در AS12880، درگاه بین‌المللی ایران، را اندازه گرفت؛ آخرین یک درصد اتصال بین‌المللی که خطوط ویژه از آن استفاده می‌کردند قطع شد.',
    },
  },
  {
    id: 'whiteSimWar', panel: 'privileged', date: '2026-03-10', sources: ['iranintlMar'],
    text: {
      en: 'During the war and the shutdown, the government spokeswoman said connectivity goes to those “who can better deliver the message”; NetBlocks observed the state spreading its messages through these whitelisted lines. President Pezeshkian said he had ordered the white lines to be “turned black as well”.',
      fa: 'در دوران جنگ و قطعی، سخنگوی دولت گفت اتصال به کسانی داده می‌شود «که بهتر می‌توانند پیام را برسانند»؛ نت‌بلاکس دید که حکومت پیام‌هایش را از طریق همین خطوط لیست سفید پخش می‌کند. رئیس‌جمهور پزشکیان گفت دستور داده است خطوط سفید «هم سیاه شوند».',
    },
  },
  {
    id: 'ban', panel: 'privileged', date: '2025-12-11', sources: ['ban'],
    text: {
      en: 'The presidential office announced that white SIM cards would be withdrawn.',
      fa: 'دفتر ریاست‌جمهوری اعلام کرد که سیم‌کارت‌های سفید جمع‌آوری می‌شوند.',
    },
  },
  {
    id: 'whiteSimRules', panel: 'privileged', date: '2025-11-27', sources: ['khabarfoori'],
    text: {
      en: 'White SIM cards are granted by the working group that decides what is blocked, at the request of bodies such as the culture and health ministries and state broadcasting.',
      fa: 'سیم‌کارت‌های سفید را کارگروه تعیین مصادیق، به درخواست نهادهایی مانند وزارت ارشاد، وزارت بهداشت و صداوسیما، اعطا می‌کند.',
    },
  },
  {
    id: 'whiteSim', panel: 'privileged', date: '2025-11-24', sources: ['zoomit', 'iranintlNov'],
    text: {
      en: 'White SIM cards, mobile lines exempt from filtering, became public when X’s location feature showed accounts of officials and state media posting directly from Iran. Zoomit counted about 50,000 in November 2025, up from fewer than 3,000 before the June 2025 war; no count has been published since the 2026 war began.',
      fa: 'سیم‌کارت‌های سفید، یعنی خطوط موبایل معاف از فیلترینگ، زمانی آشکار شدند که قابلیت موقعیت ایکس نشان داد حساب‌های مقامات و رسانه‌های دولتی مستقیم از ایران پست می‌گذارند. زومیت در آذر ۱۴۰۴ حدود ۵۰ هزار خط شمرد، در حالی که پیش از جنگ خرداد ۱۴۰۴ کمتر از ۳ هزار بود؛ از آغاز جنگ اسفند ۱۴۰۴ تاکنون شمارشی منتشر نشده است.',
    },
  },
  {
    id: 'perSubscriber', panel: 'privileged', date: '2023-01-16', sources: ['citizenlab'],
    text: {
      en: 'Citizen Lab published leaked documents from 2018–2021 showing an interface through which the regulator controls single mobile subscribers: cutting their data, limiting them to 2G, or blocking or slowing single services. The documents come mainly from Ariantel, a virtual mobile operator, and show plans, not a confirmed deployment.',
      fa: 'سیتیزن لب اسناد افشاشده‌ای از سال‌های ۲۰۱۸ تا ۲۰۲۱ میلادی منتشر کرد که رابطی را نشان می‌دهند که نهاد تنظیم‌گر با آن مشترکان منفرد موبایل را کنترل می‌کند: قطع داده، محدود کردن به 2G، یا مسدود یا کند کردن سرویس‌های مشخص. این اسناد عمدتاً از آریانتل، یک اپراتور مجازی موبایل، هستند و برنامه را نشان می‌دهند، نه اجرای تأییدشده را.',
    },
  },
];

// The latest date of an entry, as a sortable day. A month without a day counts as its middle, so
// "February to May" sorts between what happened early and late in May.
function sortKey(item) {
  const value = item.until ?? item.date;
  return value.length === 7 ? `${value}-15` : value;
}

export function contextItems(panel) {
  return CONTEXT_ITEMS
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.panel === panel)
    // Newest first; entries of the same day keep the order in which they are listed here.
    .sort((a, b) => sortKey(b.item).localeCompare(sortKey(a.item)) || a.index - b.index)
    .map(({ item }) => item);
}
