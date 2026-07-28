// Built-in emergency phrases — deliberately hardcoded (no network) so the
// emergency screen works offline. One entry per phrase; `texts` holds the
// local-language wording (plus a Latin reading for non-Latin scripts) keyed by
// language code. The meaning shown underneath comes from i18n
// (`emergency.p.<key>`) in the app's UI language.
//
// Languages not covered here fall back to English — still showable to a helper.

export type EmergencyText = { text: string; reading?: string };

export type EmergencyPhrase = {
  key: string; // i18n suffix: emergency.p.<key>
  texts: Record<string, EmergencyText>;
};

export const EMERGENCY_PHRASES: EmergencyPhrase[] = [
  {
    key: 'help',
    texts: {
      en: { text: 'Help!' },
      de: { text: 'Hilfe!' },
      'zh-TW': { text: '救命！', reading: 'jiùmìng!' },
      zh: { text: '救命！', reading: 'jiùmìng!' },
      yue: { text: '救命呀！', reading: 'gau3 meng6 aa3!' },
      ja: { text: '助けて！', reading: 'tasukete!' },
      ko: { text: '도와주세요!', reading: 'dowajuseyo!' },
      es: { text: '¡Socorro!' },
      fr: { text: 'Au secours !' },
      it: { text: 'Aiuto!' },
      pt: { text: 'Socorro!' },
      ru: { text: 'Помогите!', reading: 'pomogite!' },
      th: { text: 'ช่วยด้วย!', reading: 'chûai dûai!' },
      vi: { text: 'Cứu tôi với!' },
      id: { text: 'Tolong!' },
      ms: { text: 'Tolong!' },
      ar: { text: 'النجدة!', reading: 'an-najda!' },
    },
  },
  {
    key: 'ambulance',
    texts: {
      en: { text: 'Please call an ambulance!' },
      de: { text: 'Bitte rufen Sie einen Krankenwagen!' },
      'zh-TW': { text: '請叫救護車！', reading: 'qǐng jiào jiùhùchē!' },
      zh: { text: '请叫救护车！', reading: 'qǐng jiào jiùhùchē!' },
      yue: { text: '唔該叫救護車！', reading: 'm4 goi1 giu3 gau3 wu6 ce1!' },
      ja: { text: '救急車を呼んでください！', reading: 'kyūkyūsha o yonde kudasai!' },
      ko: { text: '구급차를 불러 주세요!', reading: 'gugeupchareul bulleo juseyo!' },
      es: { text: '¡Llame a una ambulancia, por favor!' },
      fr: { text: 'Appelez une ambulance, s’il vous plaît !' },
      it: { text: 'Chiami un’ambulanza, per favore!' },
      pt: { text: 'Chame uma ambulância, por favor!' },
      ru: { text: 'Вызовите скорую, пожалуйста!', reading: 'vyzovite skoruyu, pozhaluysta!' },
      th: { text: 'เรียกรถพยาบาลให้หน่อย!', reading: 'rîak rót phá-yaa-baan hâi nòi!' },
      vi: { text: 'Làm ơn gọi xe cứu thương!' },
      id: { text: 'Tolong panggil ambulans!' },
      ms: { text: 'Tolong panggil ambulans!' },
      ar: { text: 'من فضلك اتصل بالإسعاف!', reading: 'min faḍlik ittaṣil bil-isʿāf!' },
    },
  },
  {
    key: 'police',
    texts: {
      en: { text: 'Please call the police!' },
      de: { text: 'Bitte rufen Sie die Polizei!' },
      'zh-TW': { text: '請報警！', reading: 'qǐng bàojǐng!' },
      zh: { text: '请报警！', reading: 'qǐng bàojǐng!' },
      yue: { text: '唔該叫警察！', reading: 'm4 goi1 giu3 ging2 caat3!' },
      ja: { text: '警察を呼んでください！', reading: 'keisatsu o yonde kudasai!' },
      ko: { text: '경찰을 불러 주세요!', reading: 'gyeongchareul bulleo juseyo!' },
      es: { text: '¡Llame a la policía, por favor!' },
      fr: { text: 'Appelez la police, s’il vous plaît !' },
      it: { text: 'Chiami la polizia, per favore!' },
      pt: { text: 'Chame a polícia, por favor!' },
      ru: { text: 'Вызовите полицию, пожалуйста!', reading: 'vyzovite politsiyu, pozhaluysta!' },
      th: { text: 'เรียกตำรวจให้หน่อย!', reading: 'rîak tam-rùat hâi nòi!' },
      vi: { text: 'Làm ơn gọi cảnh sát!' },
      id: { text: 'Tolong panggil polisi!' },
      ms: { text: 'Tolong panggil polis!' },
      ar: { text: 'من فضلك اتصل بالشرطة!', reading: 'min faḍlik ittaṣil bish-shurṭa!' },
    },
  },
  {
    key: 'doctor',
    texts: {
      en: { text: 'I need a doctor.' },
      de: { text: 'Ich brauche einen Arzt.' },
      'zh-TW': { text: '我需要醫生。', reading: 'wǒ xūyào yīshēng.' },
      zh: { text: '我需要医生。', reading: 'wǒ xūyào yīshēng.' },
      yue: { text: '我需要醫生。', reading: 'ngo5 seoi1 jiu3 ji1 sang1.' },
      ja: { text: '医者が必要です。', reading: 'isha ga hitsuyō desu.' },
      ko: { text: '의사가 필요해요.', reading: 'uisaga piryohaeyo.' },
      es: { text: 'Necesito un médico.' },
      fr: { text: 'J’ai besoin d’un médecin.' },
      it: { text: 'Ho bisogno di un medico.' },
      pt: { text: 'Preciso de um médico.' },
      ru: { text: 'Мне нужен врач.', reading: 'mne nuzhen vrach.' },
      th: { text: 'ฉันต้องการหมอ', reading: 'chăn tông-gaan mŏr' },
      vi: { text: 'Tôi cần bác sĩ.' },
      id: { text: 'Saya butuh dokter.' },
      ms: { text: 'Saya perlukan doktor.' },
      ar: { text: 'أحتاج إلى طبيب.', reading: 'aḥtāj ilā ṭabīb.' },
    },
  },
  {
    key: 'injured',
    texts: {
      en: { text: 'I am injured.' },
      de: { text: 'Ich bin verletzt.' },
      'zh-TW': { text: '我受傷了。', reading: 'wǒ shòushāng le.' },
      zh: { text: '我受伤了。', reading: 'wǒ shòushāng le.' },
      yue: { text: '我受咗傷。', reading: 'ngo5 sau6 zo2 soeng1.' },
      ja: { text: 'けがをしています。', reading: 'kega o shite imasu.' },
      ko: { text: '다쳤어요.', reading: 'dachyeosseoyo.' },
      es: { text: 'Estoy herido.' },
      fr: { text: 'Je suis blessé(e).' },
      it: { text: 'Sono ferito.' },
      pt: { text: 'Estou ferido.' },
      ru: { text: 'Я ранен.', reading: 'ya ranen.' },
      th: { text: 'ฉันบาดเจ็บ', reading: 'chăn bàat-jèp' },
      vi: { text: 'Tôi bị thương.' },
      id: { text: 'Saya terluka.' },
      ms: { text: 'Saya cedera.' },
      ar: { text: 'أنا مصاب.', reading: 'anā muṣāb.' },
    },
  },
  {
    key: 'emergency',
    texts: {
      en: { text: 'This is an emergency.' },
      de: { text: 'Das ist ein Notfall.' },
      'zh-TW': { text: '這是緊急情況。', reading: 'zhè shì jǐnjí qíngkuàng.' },
      zh: { text: '这是紧急情况。', reading: 'zhè shì jǐnjí qíngkuàng.' },
      yue: { text: '呢個係緊急情況。', reading: 'ni1 go3 hai6 gan2 gap1 cing4 fong3.' },
      ja: { text: '緊急事態です。', reading: 'kinkyū jitai desu.' },
      ko: { text: '응급 상황이에요.', reading: 'eunggeup sanghwang-ieyo.' },
      es: { text: 'Es una emergencia.' },
      fr: { text: 'C’est une urgence.' },
      it: { text: 'È un’emergenza.' },
      pt: { text: 'É uma emergência.' },
      ru: { text: 'Это чрезвычайная ситуация.', reading: 'eto chrezvychaynaya situatsiya.' },
      th: { text: 'นี่คือเหตุฉุกเฉิน', reading: 'nîi keu hèt chùk-chĕrn' },
      vi: { text: 'Đây là trường hợp khẩn cấp.' },
      id: { text: 'Ini keadaan darurat.' },
      ms: { text: 'Ini kecemasan.' },
      ar: { text: 'هذه حالة طارئة.', reading: 'hādhihi ḥāla ṭāriʾa.' },
    },
  },
  {
    key: 'hospital',
    texts: {
      en: { text: 'Where is the nearest hospital?' },
      de: { text: 'Wo ist das nächste Krankenhaus?' },
      'zh-TW': { text: '最近的醫院在哪裡？', reading: 'zuìjìn de yīyuàn zài nǎlǐ?' },
      zh: { text: '最近的医院在哪里？', reading: 'zuìjìn de yīyuàn zài nǎlǐ?' },
      yue: { text: '最近嘅醫院喺邊度？', reading: 'zeoi3 gan6 ge3 ji1 jyun2 hai2 bin1 dou6?' },
      ja: { text: '一番近い病院はどこですか？', reading: 'ichiban chikai byōin wa doko desu ka?' },
      ko: { text: '가장 가까운 병원이 어디예요?', reading: 'gajang gakkaun byeongwoni eodiyeyo?' },
      es: { text: '¿Dónde está el hospital más cercano?' },
      fr: { text: 'Où est l’hôpital le plus proche ?' },
      it: { text: 'Dov’è l’ospedale più vicino?' },
      pt: { text: 'Onde fica o hospital mais próximo?' },
      ru: { text: 'Где ближайшая больница?', reading: 'gde blizhayshaya bolnitsa?' },
      th: { text: 'โรงพยาบาลที่ใกล้ที่สุดอยู่ที่ไหน', reading: 'rohng-phá-yaa-baan tîi glâi tîi-sùt yùu tîi năi' },
      vi: { text: 'Bệnh viện gần nhất ở đâu?' },
      id: { text: 'Di mana rumah sakit terdekat?' },
      ms: { text: 'Di mana hospital terdekat?' },
      ar: { text: 'أين أقرب مستشفى؟', reading: 'ayna aqrab mustashfā?' },
    },
  },
  {
    key: 'understand',
    texts: {
      en: { text: 'I don’t understand.' },
      de: { text: 'Ich verstehe nicht.' },
      'zh-TW': { text: '我聽不懂。', reading: 'wǒ tīng bù dǒng.' },
      zh: { text: '我听不懂。', reading: 'wǒ tīng bù dǒng.' },
      yue: { text: '我唔明。', reading: 'ngo5 m4 ming4.' },
      ja: { text: 'わかりません。', reading: 'wakarimasen.' },
      ko: { text: '못 알아들어요.', reading: 'mot aradeureoyo.' },
      es: { text: 'No entiendo.' },
      fr: { text: 'Je ne comprends pas.' },
      it: { text: 'Non capisco.' },
      pt: { text: 'Não entendo.' },
      ru: { text: 'Я не понимаю.', reading: 'ya ne ponimayu.' },
      th: { text: 'ฉันไม่เข้าใจ', reading: 'chăn mâi kâo-jai' },
      vi: { text: 'Tôi không hiểu.' },
      id: { text: 'Saya tidak mengerti.' },
      ms: { text: 'Saya tidak faham.' },
      ar: { text: 'لا أفهم.', reading: 'lā afham.' },
    },
  },
  {
    key: 'lost',
    texts: {
      en: { text: 'I am lost.' },
      de: { text: 'Ich habe mich verlaufen.' },
      'zh-TW': { text: '我迷路了。', reading: 'wǒ mílù le.' },
      zh: { text: '我迷路了。', reading: 'wǒ mílù le.' },
      yue: { text: '我蕩失路。', reading: 'ngo5 dong6 sat1 lou6.' },
      ja: { text: '道に迷いました。', reading: 'michi ni mayoimashita.' },
      ko: { text: '길을 잃었어요.', reading: 'gireul ireosseoyo.' },
      es: { text: 'Estoy perdido.' },
      fr: { text: 'Je suis perdu(e).' },
      it: { text: 'Mi sono perso.' },
      pt: { text: 'Estou perdido.' },
      ru: { text: 'Я заблудился.', reading: 'ya zabludilsya.' },
      th: { text: 'ฉันหลงทาง', reading: 'chăn lŏng taang' },
      vi: { text: 'Tôi bị lạc đường.' },
      id: { text: 'Saya tersesat.' },
      ms: { text: 'Saya sesat.' },
      ar: { text: 'لقد ضللت الطريق.', reading: 'laqad ḍalaltu aṭ-ṭarīq.' },
    },
  },
];

// The phrase in `lang`, falling back to English for uncovered languages —
// English is the most likely second language of a helper anywhere.
export function emergencyText(p: EmergencyPhrase, lang: string): EmergencyText {
  return p.texts[lang] ?? p.texts.en;
}

// Whether the goal language has native texts (false → the English fallback is
// being shown, flagged in the UI).
export function hasEmergencyTexts(lang: string): boolean {
  return EMERGENCY_PHRASES.every((p) => !!p.texts[lang]);
}
