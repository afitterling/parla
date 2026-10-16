// "Symbol of the day" — a fixed, beginner-first sequence of characters per
// Han-script goal language, handed out one per notification slot. The lists are
// deliberately hardcoded (no network) so the notifications can be scheduled a
// week ahead while the app is closed; the explanation of a character is fetched
// from the Coach on demand (see api.explainSymbol) and cached.
//
// A learner walks the list from the start: slot index 0 is the first symbol,
// and the sequence wraps around when the end is reached.

export type DailySymbol = {
  char: string;
  // Latin reading aid (Pinyin / Romaji). Missing where the list has no
  // language-specific readings (Cantonese) — the Coach supplies one then.
  reading?: string;
};

// Simplified Chinese, roughly HSK 1 in a teaching order: numbers, nature and
// body radicals, people, the everyday verbs, then time, places and objects.
const ZH: [string, string][] = [
  ['一', 'yī'], ['二', 'èr'], ['三', 'sān'], ['四', 'sì'], ['五', 'wǔ'],
  ['六', 'liù'], ['七', 'qī'], ['八', 'bā'], ['九', 'jiǔ'], ['十', 'shí'],
  ['人', 'rén'], ['大', 'dà'], ['小', 'xiǎo'], ['中', 'zhōng'], ['口', 'kǒu'],
  ['日', 'rì'], ['月', 'yuè'], ['山', 'shān'], ['水', 'shuǐ'], ['火', 'huǒ'],
  ['木', 'mù'], ['土', 'tǔ'], ['天', 'tiān'], ['上', 'shàng'], ['下', 'xià'],
  ['我', 'wǒ'], ['你', 'nǐ'], ['他', 'tā'], ['她', 'tā'], ['们', 'men'],
  ['好', 'hǎo'], ['是', 'shì'], ['不', 'bù'], ['的', 'de'], ['了', 'le'],
  ['吗', 'ma'], ['呢', 'ne'], ['有', 'yǒu'], ['没', 'méi'], ['在', 'zài'],
  ['来', 'lái'], ['去', 'qù'], ['看', 'kàn'], ['听', 'tīng'], ['说', 'shuō'],
  ['读', 'dú'], ['写', 'xiě'], ['吃', 'chī'], ['喝', 'hē'], ['买', 'mǎi'],
  ['做', 'zuò'], ['学', 'xué'], ['生', 'shēng'], ['老', 'lǎo'], ['师', 'shī'],
  ['同', 'tóng'], ['朋', 'péng'], ['友', 'yǒu'], ['家', 'jiā'], ['爸', 'bà'],
  ['妈', 'mā'], ['儿', 'ér'], ['子', 'zǐ'], ['女', 'nǚ'], ['男', 'nán'],
  ['名', 'míng'], ['字', 'zì'], ['什', 'shén'], ['么', 'me'], ['谁', 'shéi'],
  ['哪', 'nǎ'], ['那', 'nà'], ['这', 'zhè'], ['个', 'gè'], ['几', 'jǐ'],
  ['多', 'duō'], ['少', 'shǎo'], ['很', 'hěn'], ['太', 'tài'], ['都', 'dōu'],
  ['也', 'yě'], ['和', 'hé'], ['年', 'nián'], ['今', 'jīn'], ['明', 'míng'],
  ['昨', 'zuó'], ['时', 'shí'], ['候', 'hòu'], ['点', 'diǎn'], ['分', 'fēn'],
  ['早', 'zǎo'], ['晚', 'wǎn'], ['星', 'xīng'], ['期', 'qī'], ['岁', 'suì'],
  ['号', 'hào'], ['现', 'xiàn'], ['前', 'qián'], ['后', 'hòu'], ['里', 'lǐ'],
  ['外', 'wài'], ['东', 'dōng'], ['西', 'xī'], ['南', 'nán'], ['北', 'běi'],
  ['国', 'guó'], ['汉', 'hàn'], ['语', 'yǔ'], ['书', 'shū'], ['本', 'běn'],
  ['电', 'diàn'], ['话', 'huà'], ['脑', 'nǎo'], ['视', 'shì'], ['影', 'yǐng'],
  ['车', 'chē'], ['飞', 'fēi'], ['机', 'jī'], ['出', 'chū'], ['回', 'huí'],
  ['开', 'kāi'], ['关', 'guān'], ['门', 'mén'], ['坐', 'zuò'], ['站', 'zhàn'],
  ['住', 'zhù'], ['打', 'dǎ'], ['叫', 'jiào'], ['认', 'rèn'], ['识', 'shí'],
  ['会', 'huì'], ['能', 'néng'], ['想', 'xiǎng'], ['要', 'yào'], ['喜', 'xǐ'],
  ['欢', 'huān'], ['爱', 'ài'], ['谢', 'xiè'], ['请', 'qǐng'], ['对', 'duì'],
  ['起', 'qǐ'], ['再', 'zài'], ['见', 'jiàn'], ['钱', 'qián'], ['块', 'kuài'],
  ['元', 'yuán'], ['商', 'shāng'], ['店', 'diàn'], ['菜', 'cài'], ['饭', 'fàn'],
  ['茶', 'chá'], ['米', 'mǐ'], ['果', 'guǒ'], ['苹', 'píng'], ['杯', 'bēi'],
  ['猫', 'māo'], ['狗', 'gǒu'], ['雨', 'yǔ'], ['冷', 'lěng'], ['热', 'rè'],
  ['高', 'gāo'], ['兴', 'xìng'], ['漂', 'piào'], ['亮', 'liàng'], ['衣', 'yī'],
  ['服', 'fú'], ['医', 'yī'], ['院', 'yuàn'], ['桌', 'zhuō'], ['椅', 'yǐ'],
  ['睡', 'shuì'], ['觉', 'jiào'], ['工', 'gōng'], ['作', 'zuò'], ['先', 'xiān'],
  ['些', 'xiē'], ['怎', 'zěn'], ['样', 'yàng'], ['用', 'yòng'], ['白', 'bái'],
  ['黑', 'hēi'], ['红', 'hóng'],
];

// Simplified → traditional for every character above that differs. The
// traditional list is the same sequence with these swapped in, so a learner of
// Taiwanese Mandarin or Cantonese sees the forms actually used there.
const S2T: Record<string, string> = {
  们: '們', 吗: '嗎', 没: '沒', 来: '來', 听: '聽', 说: '說', 读: '讀', 写: '寫',
  买: '買', 学: '學', 师: '師', 妈: '媽', 儿: '兒', 么: '麼', 谁: '誰', 这: '這',
  个: '個', 几: '幾', 时: '時', 点: '點', 岁: '歲', 号: '號', 现: '現', 后: '後',
  里: '裡', 东: '東', 国: '國', 汉: '漢', 语: '語', 书: '書', 电: '電', 话: '話',
  脑: '腦', 视: '視', 车: '車', 飞: '飛', 机: '機', 开: '開', 关: '關', 门: '門',
  认: '認', 识: '識', 会: '會', 欢: '歡', 爱: '愛', 谢: '謝', 请: '請', 对: '對',
  见: '見', 钱: '錢', 块: '塊', 饭: '飯', 苹: '蘋', 猫: '貓', 热: '熱', 兴: '興',
  医: '醫', 觉: '覺', 样: '樣', 红: '紅',
};

// Japanese: the two kana syllabaries first (a learner needs them before any
// kanji), then the most common JLPT N5 kanji. Kanji readings give the one most
// useful for a beginner — kun where a standalone word exists, on otherwise.
const HIRAGANA: [string, string][] = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'wo'], ['ん', 'n'],
];

const KATAKANA: [string, string][] = [
  ['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o'],
  ['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko'],
  ['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so'],
  ['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to'],
  ['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no'],
  ['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho'],
  ['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo'],
  ['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo'],
  ['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro'],
  ['ワ', 'wa'], ['ヲ', 'wo'], ['ン', 'n'],
];

const KANJI: [string, string][] = [
  ['一', 'ichi'], ['二', 'ni'], ['三', 'san'], ['四', 'shi / yon'], ['五', 'go'],
  ['六', 'roku'], ['七', 'nana / shichi'], ['八', 'hachi'], ['九', 'kyū'], ['十', 'jū'],
  ['百', 'hyaku'], ['千', 'sen'], ['万', 'man'], ['円', 'en'],
  ['日', 'hi / nichi'], ['月', 'tsuki / getsu'], ['火', 'hi / ka'], ['水', 'mizu / sui'],
  ['木', 'ki / moku'], ['金', 'kane / kin'], ['土', 'tsuchi / do'],
  ['人', 'hito / jin'], ['大', 'ōkii / dai'], ['小', 'chiisai / shō'], ['中', 'naka / chū'],
  ['上', 'ue / jō'], ['下', 'shita / ka'], ['右', 'migi'], ['左', 'hidari'],
  ['山', 'yama / san'], ['川', 'kawa'], ['天', 'ten'], ['空', 'sora / kū'], ['雨', 'ame'],
  ['花', 'hana'], ['犬', 'inu'], ['魚', 'sakana'],
  ['口', 'kuchi'], ['目', 'me'], ['耳', 'mimi'], ['手', 'te'], ['足', 'ashi'],
  ['男', 'otoko'], ['女', 'onna'], ['子', 'ko'], ['父', 'chichi'], ['母', 'haha'], ['友', 'tomo'],
  ['先', 'saki / sen'], ['生', 'sei / ikiru'], ['学', 'gaku'], ['校', 'kō'], ['本', 'hon'],
  ['名', 'na / mei'], ['語', 'go'], ['話', 'hanashi / hanasu'], ['聞', 'kiku'], ['読', 'yomu'],
  ['書', 'kaku'], ['見', 'miru'], ['言', 'iu'], ['食', 'taberu'], ['飲', 'nomu'],
  ['行', 'iku'], ['来', 'kuru'], ['出', 'deru'], ['入', 'hairu'], ['会', 'au / kai'],
  ['買', 'kau'], ['立', 'tatsu'], ['休', 'yasumu'],
  ['今', 'ima / kon'], ['時', 'toki / ji'], ['分', 'fun / wakaru'], ['半', 'han'],
  ['年', 'toshi / nen'], ['週', 'shū'], ['毎', 'mai'], ['前', 'mae / zen'], ['後', 'ato / go'],
  ['間', 'aida / kan'], ['午', 'go'], ['何', 'nani'],
  ['東', 'higashi / tō'], ['西', 'nishi / sei'], ['南', 'minami / nan'], ['北', 'kita / hoku'],
  ['外', 'soto / gai'], ['国', 'kuni / koku'], ['駅', 'eki'], ['店', 'mise / ten'],
  ['道', 'michi / dō'], ['車', 'kuruma / sha'], ['電', 'den'], ['気', 'ki'],
  ['高', 'takai / kō'], ['長', 'nagai / chō'], ['白', 'shiro / haku'],
];

function toSymbols(pairs: [string, string][]): DailySymbol[] {
  return pairs.map(([char, reading]) => ({ char, reading }));
}

const zh = toSymbols(ZH);
const zhTW = ZH.map(([char, reading]) => ({ char: S2T[char] ?? char, reading }));
// Cantonese shares the traditional forms; Mandarin Pinyin would be wrong for
// it, so the reading is left to the Coach.
const yue = zhTW.map(({ char }) => ({ char }));
const ja = toSymbols([...HIRAGANA, ...KATAKANA, ...KANJI]);

const LISTS: Record<string, DailySymbol[]> = { zh, 'zh-TW': zhTW, yue, ja };

// Languages the feature covers. Only these have a list; for anything else the
// Settings section explains that it needs one of them as the goal language.
export function hasDailySymbols(lang: string): boolean {
  return lang in LISTS;
}

export function symbolCount(lang: string): number {
  return LISTS[lang]?.length ?? 0;
}

// The symbol at a slot index, wrapping around the end of the list.
export function symbolAt(lang: string, index: number): DailySymbol | null {
  const list = LISTS[lang];
  if (!list || list.length === 0) return null;
  const i = ((index % list.length) + list.length) % list.length;
  return list[i];
}

// Notification slots per day (24h clock). One a day comes in the morning;
// three a day spread over morning, midday and evening.
export function slotHours(perDay: number): number[] {
  return perDay >= 3 ? [9, 13, 19] : [9];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Whole days between the day the feature was switched on and `at` (local
// calendar days, so a DST change doesn't shift the count).
export function dayIndex(start: number, at: Date): number {
  const diff = startOfDay(at).getTime() - startOfDay(new Date(start)).getTime();
  return Math.max(0, Math.round(diff / DAY_MS));
}

// The slot index whose symbol is "current" at `at`: the latest slot that has
// already fired. Before the first slot of day 0 it is simply the first symbol.
export function currentSlotIndex(start: number, perDay: number, at: Date): number {
  const hours = slotHours(perDay);
  const day = dayIndex(start, at);
  const passed = hours.filter((h) => at.getTime() >= startOfDay(at).getTime() + h * 3600000).length;
  return Math.max(0, day * hours.length + passed - 1);
}

// Fire time + slot index for every slot from now over the next `days` days.
export function upcomingSlots(
  start: number,
  perDay: number,
  now: Date,
  days: number
): { date: Date; index: number }[] {
  const hours = slotHours(perDay);
  const day0 = dayIndex(start, now);
  const out: { date: Date; index: number }[] = [];
  for (let d = 0; d < days; d++) {
    const base = startOfDay(now).getTime() + d * DAY_MS;
    hours.forEach((h, slot) => {
      const date = new Date(base + h * 3600000);
      if (date.getTime() <= now.getTime()) return;
      out.push({ date, index: (day0 + d) * hours.length + slot });
    });
  }
  return out;
}
