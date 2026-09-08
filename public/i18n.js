// Trilingual strings for the static UI chrome (labels, buttons, hints) and the
// client-generated system/status messages — the part of the page a visitor
// actually reads before ever talking to the concierge. Two things are
// deliberately OUT of scope here, for the same reason: they're not fixed
// strings this dictionary can own.
//   - Server-returned API error text (e.g. "Invalid credentials", rate-limit
//     messages) stays English pass-through. Translating it client-side would
//     mean matching against the English wording by content, which silently
//     breaks the moment that wording changes on the server — a real
//     end-to-end fix is a language-aware API (error codes the client maps to
//     its own strings), not a client-side guess.
//   - honestyFlags are open-ended, provider-supplied strings from the jobs
//     feed (lib/yf/matching.js), not a fixed vocabulary — there's nothing to
//     pre-translate.
// UMD-style export so this is testable with plain node:test (no DOM, no new
// dependency) and usable directly as a <script> tag in the browser, same
// pattern as format.js.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.i18n = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const STRINGS = {
    en: {
      signOut: 'Sign out',
      tabSignIn: 'Sign in',
      tabCreateAccount: 'Create account',
      authTitleWelcome: 'Welcome back',
      authTitleCreate: 'Create your account',
      authHint: 'Yalla Falaina is for job and immigration seekers 18 and older. The concierge connects you with real opportunities — it never replaces a licensed professional.',
      labelEmail: 'Email',
      labelPassword: 'Password',
      labelFullName: 'Full name',
      labelPreferredLanguage: 'Preferred language',
      labelPreferredCountry: 'Preferred country',
      preferredCountryNote: '(a preference, not a filter)',
      labelSector: 'Sector of work',
      sectorPlaceholder: 'e.g. trades, kitchen, logistics',
      confirmAgeLabel: 'I confirm I am 18 or older',
      acceptTermsLabel: 'I accept the Terms of Use',
      countryInputPlaceholder: 'Preferred country (optional)',
      errAgeGate: 'Yalla Falaina is for people 18 and older.',
      errAcceptTerms: 'Please accept the Terms of Use.',
      msgAccountCreatedEmailPending: 'Account created — we could not send the verification email yet; try signing in again shortly.',
      msgCheckEmail: 'Check your email to verify.',
      errRegistrationFailed: 'Registration failed',
      errSignInFailed: 'Sign-in failed',
      resendVerifyLink: 'Resend verification email',
      resendGenericFallback: 'If that account needs verifying, we just sent a new link.',
      paywallText: 'Basic — $25/month. The concierge is a subscriber feature: real matched opportunities, logged answers, daily fair-use quota.',
      retentionNote: 'If you cancel, you keep access until the end of the paid period, then have 30 days to come back with everything as you left it. After that, your profile and intake details are permanently deleted — your account itself stays.',
      subscribeBtn: 'Subscribe with PayPal',
      sendBtn: 'Send',
      jobsHeading: 'Matched opportunities',
      jobsPlaceholder: 'Send a message to see what the matching engine finds — jobs shown here are the only ones the assistant is allowed to reference.',
      noJobsMatched: 'No opportunities matched this message.',
      viewPosting: 'View posting ↗',
      welcomeSystemMessage: 'Ask me about real opportunities abroad — jobs, what a posting requires, or whether an offer looks safe. I answer in your language and dialect.',
      demoModeNotice: 'Demo mode — the assistant model is not configured yet; showing raw matches.',
      networkError: 'Network error — please try again.',
      errorPrefix: 'Error: ',
      subActiveRenews: 'Basic — active (renews {date})',
      checkoutPending: '…',
      checkoutUnavailable: 'Checkout unavailable',
      unverifiedFlagLabel: 'unverified listing — verify independently',
      previewUnlockLabel: '🔒 Subscribe to see the details & apply',
      previewRemainingNotice: 'Free preview — {n} free replies left before subscribing.',
      readTermsLink: '(read)',
      readPrivacyLink: '(privacy)',
      cancelSubBtn: 'Cancel subscription',
      cancelSubConfirmText: "Cancel? You'll keep access until the paid period ends.",
      cancelSubYes: 'Yes, cancel',
      cancelSubNo: 'Never mind',
      cancelSubFailed: 'Could not cancel — please try again.',
      cancelSubSuccess: 'Cancellation requested — you keep access until the end of the paid period.',
    },
    fr: {
      signOut: 'Se déconnecter',
      tabSignIn: 'Se connecter',
      tabCreateAccount: 'Créer un compte',
      authTitleWelcome: 'Content de vous revoir',
      authTitleCreate: 'Créez votre compte',
      authHint: "Yalla Falaina s'adresse aux chercheurs d'emploi et d'immigration de 18 ans et plus. L'assistant vous met en contact avec de vraies opportunités — il ne remplace jamais un professionnel autorisé.",
      labelEmail: 'Courriel',
      labelPassword: 'Mot de passe',
      labelFullName: 'Nom complet',
      labelPreferredLanguage: 'Langue préférée',
      labelPreferredCountry: 'Pays préféré',
      preferredCountryNote: '(une préférence, pas un filtre)',
      labelSector: "Secteur d'activité",
      sectorPlaceholder: 'p. ex. métiers manuels, cuisine, logistique',
      confirmAgeLabel: "Je confirme avoir 18 ans ou plus",
      acceptTermsLabel: "J'accepte les conditions d'utilisation",
      countryInputPlaceholder: 'Pays préféré (facultatif)',
      errAgeGate: 'Yalla Falaina est réservé aux personnes de 18 ans et plus.',
      errAcceptTerms: "Veuillez accepter les conditions d'utilisation.",
      msgAccountCreatedEmailPending: "Compte créé — nous n'avons pas pu envoyer le courriel de vérification pour l'instant; réessayez de vous connecter sous peu.",
      msgCheckEmail: 'Vérifiez votre courriel pour confirmer votre compte.',
      errRegistrationFailed: "Échec de l'inscription",
      errSignInFailed: 'Échec de la connexion',
      resendVerifyLink: 'Renvoyer le courriel de vérification',
      resendGenericFallback: 'Si ce compte doit être vérifié, nous venons d\'envoyer un nouveau lien.',
      paywallText: "Basique — 25 $/mois. L'assistant est réservé aux abonnés : de vraies opportunités ciblées, des réponses enregistrées, un quota d'utilisation équitable quotidien.",
      retentionNote: "Si vous annulez, vous gardez l'accès jusqu'à la fin de la période payée, puis avez 30 jours pour revenir et tout retrouver tel quel. Après ce délai, votre profil et vos informations d'admission sont définitivement supprimés — votre compte, lui, reste.",
      subscribeBtn: "S'abonner avec PayPal",
      sendBtn: 'Envoyer',
      jobsHeading: 'Opportunités correspondantes',
      jobsPlaceholder: "Envoyez un message pour voir ce que le moteur de recherche trouve — les offres affichées ici sont les seules que l'assistant est autorisé à mentionner.",
      noJobsMatched: 'Aucune opportunité ne correspond à ce message.',
      viewPosting: "Voir l'offre ↗",
      welcomeSystemMessage: "Posez-moi des questions sur de vraies opportunités à l'étranger — les emplois, ce qu'exige une offre, ou si une offre semble sûre. Je réponds dans votre langue et votre dialecte.",
      demoModeNotice: "Mode démo — le modèle de l'assistant n'est pas encore configuré; affichage des résultats bruts.",
      networkError: 'Erreur réseau — veuillez réessayer.',
      errorPrefix: 'Erreur : ',
      subActiveRenews: 'Basique — actif (renouvellement le {date})',
      checkoutPending: '…',
      checkoutUnavailable: 'Paiement indisponible',
      unverifiedFlagLabel: 'annonce non vérifiée — à vérifier vous-même',
      previewUnlockLabel: "🔒 Abonnez-vous pour voir les détails et postuler",
      previewRemainingNotice: 'Aperçu gratuit — {n} réponses gratuites restantes avant l\'abonnement.',
      readTermsLink: '(lire)',
      readPrivacyLink: '(confidentialité)',
      cancelSubBtn: "Annuler l'abonnement",
      cancelSubConfirmText: "Annuler? Vous gardez l'accès jusqu'à la fin de la période payée.",
      cancelSubYes: 'Oui, annuler',
      cancelSubNo: 'Laisser tomber',
      cancelSubFailed: "Impossible d'annuler — veuillez réessayer.",
      cancelSubSuccess: "Annulation demandée — vous gardez l'accès jusqu'à la fin de la période payée.",
    },
    ar: {
      signOut: 'تسجيل الخروج',
      tabSignIn: 'تسجيل الدخول',
      tabCreateAccount: 'إنشاء حساب',
      authTitleWelcome: 'مرحبًا بعودتك',
      authTitleCreate: 'أنشئ حسابك',
      authHint: 'منصة يلا فلاينة مخصصة للباحثين عن عمل والهجرة الذين تبلغ أعمارهم 18 عامًا فما فوق. يساعدك المساعد الذكي على إيجاد فرص حقيقية — ولا يحل أبدًا محل مختص مرخّص.',
      labelEmail: 'البريد الإلكتروني',
      labelPassword: 'كلمة المرور',
      labelFullName: 'الاسم الكامل',
      labelPreferredLanguage: 'اللغة المفضلة',
      labelPreferredCountry: 'الدولة المفضلة',
      preferredCountryNote: '(تفضيل وليس شرطًا)',
      labelSector: 'قطاع العمل',
      sectorPlaceholder: 'مثال: الحرف، المطبخ، اللوجستيات',
      confirmAgeLabel: 'أؤكد أن عمري 18 عامًا أو أكثر',
      acceptTermsLabel: 'أوافق على شروط الاستخدام',
      countryInputPlaceholder: 'الدولة المفضلة (اختياري)',
      errAgeGate: 'منصة يلا فلاينة مخصصة للأشخاص البالغين 18 عامًا فما فوق.',
      errAcceptTerms: 'يرجى الموافقة على شروط الاستخدام.',
      msgAccountCreatedEmailPending: 'تم إنشاء الحساب — لم نتمكن من إرسال بريد التحقق حتى الآن؛ حاول تسجيل الدخول مرة أخرى بعد قليل.',
      msgCheckEmail: 'تحقّق من بريدك الإلكتروني لتأكيد حسابك.',
      errRegistrationFailed: 'فشل التسجيل',
      errSignInFailed: 'فشل تسجيل الدخول',
      resendVerifyLink: 'إعادة إرسال بريد التحقق',
      resendGenericFallback: 'إذا كان هذا الحساب بحاجة إلى التحقق، فقد أرسلنا للتو رابطًا جديدًا.',
      paywallText: 'الباقة الأساسية — 25 دولارًا شهريًا. المساعد الذكي متاح للمشتركين فقط: فرص حقيقية مطابقة، ردود موثّقة، وحصة استخدام عادلة يوميًا.',
      retentionNote: 'إذا ألغيت اشتراكك، تحتفظ بالوصول حتى نهاية الفترة المدفوعة، ثم أمامك 30 يومًا للعودة وكل شيء كما تركته. بعد ذلك تُحذف بيانات ملفك ومعلومات التسجيل نهائيًا — أما حسابك فيبقى.',
      subscribeBtn: 'الاشتراك عبر PayPal',
      sendBtn: 'إرسال',
      jobsHeading: 'الفرص المطابقة',
      jobsPlaceholder: 'أرسل رسالة لترى ما يجده محرك المطابقة — الوظائف المعروضة هنا هي الوحيدة التي يُسمح للمساعد بالإشارة إليها.',
      noJobsMatched: 'لا توجد فرص مطابقة لهذه الرسالة.',
      viewPosting: 'عرض الإعلان ↗',
      welcomeSystemMessage: 'اسألني عن فرص حقيقية في الخارج — الوظائف، ما تتطلبه إعلانات العمل، أو ما إذا كان العرض آمنًا. أجيبك بلغتك ولهجتك.',
      demoModeNotice: 'وضع تجريبي — لم يتم إعداد نموذج المساعد بعد؛ يتم عرض النتائج الأولية فقط.',
      networkError: 'خطأ في الشبكة — يرجى المحاولة مرة أخرى.',
      errorPrefix: 'خطأ: ',
      subActiveRenews: 'الباقة الأساسية — نشطة (يتجدد بتاريخ {date})',
      checkoutPending: '…',
      checkoutUnavailable: 'الدفع غير متاح',
      unverifiedFlagLabel: 'إعلان غير موثّق — يُرجى التحقق بنفسك',
      previewUnlockLabel: '🔒 اشترك لرؤية التفاصيل والتقديم',
      previewRemainingNotice: 'معاينة مجانية — تبقّى لك {n} ردود مجانية قبل الاشتراك.',
      readTermsLink: '(اقرأ)',
      readPrivacyLink: '(الخصوصية)',
      cancelSubBtn: 'إلغاء الاشتراك',
      cancelSubConfirmText: 'إلغاء؟ ستحتفظ بالوصول حتى نهاية الفترة المدفوعة.',
      cancelSubYes: 'نعم، إلغاء',
      cancelSubNo: 'تراجع',
      cancelSubFailed: 'تعذّر الإلغاء — يرجى المحاولة مرة أخرى.',
      cancelSubSuccess: 'تم طلب الإلغاء — تحتفظ بالوصول حتى نهاية الفترة المدفوعة.',
    },
  };

  const LANGS = Object.keys(STRINGS);
  const isRTL = lang => lang === 'ar';

  function t(lang, key, vars) {
    const table = STRINGS[lang] || STRINGS.en;
    let s = Object.prototype.hasOwnProperty.call(table, key)
      ? table[key]
      : (Object.prototype.hasOwnProperty.call(STRINGS.en, key) ? STRINGS.en[key] : key);
    if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    return s;
  }

  return { STRINGS, LANGS, isRTL, t };
});
