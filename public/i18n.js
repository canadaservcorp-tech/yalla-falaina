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
      authHint: 'Yalla Nsafer is for job and immigration seekers 18 and older. The concierge connects you with real opportunities — it never replaces a licensed professional.',
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
      errAgeGate: 'Yalla Nsafer is for people 18 and older.',
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
      subscribeStripeBtn: 'Pay by card (Stripe)',
      sendBtn: 'Send',
      jobsHeading: 'Matched opportunities',
      jobsPlaceholder: 'Send a message to see what the matching engine finds — jobs shown here are the only ones the assistant is allowed to reference.',
      noJobsMatched: 'No opportunities matched this message.',
      // Live-test finding ("feed-claim on completion turn"): the feed is
      // never actually searched until the turn AFTER a profile becomes
      // complete, so an empty jobs list on the completion turn itself means
      // "not searched yet," not "searched and found nothing" — showing
      // noJobsMatched there would be a false claim about the feed. This is
      // the honest alternative for exactly that turn.
      profileCompleteSearching: "Your profile is complete — send your next message and I'll search real openings for you.",
      viewPosting: 'View posting ↗',
      welcomeSystemMessage: 'Ask me about real opportunities abroad — jobs, what a posting requires, or whether an offer looks safe. I answer in your language and dialect.',
      demoModeNotice: 'Demo mode — the assistant model is not configured yet; showing raw matches.',
      networkError: 'Network error — please try again.',
      errorPrefix: 'Error: ',
      subActiveRenews: 'Basic — active (renews {date})',
      subActiveCanceled: 'Basic — active until {date} (canceled, will not renew)',
      checkoutPending: '…',
      checkoutUnavailable: 'Checkout unavailable',
      unverifiedFlagLabel: 'unverified listing — verify independently',
      // Live-test finding ("seed jobs presented as real"): flags a
      // routes/concierge.js demoJob()-redacted fixture/placeholder listing
      // so it never reads like a real opening, same purpose as
      // unverifiedFlagLabel above for a different honesty gap.
      demoFlagLabel: 'demo listing — not a real opening',
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
      postListingLink: 'Post an urgent listing — no account needed',
      postListingHint: 'For quick, informal help — "shawarma cook needed today." A human reviews every post before it’s shown; it’s separate from the matched-opportunities feed above.',
      postListingContact: 'How can people reach you?',
      postListingContactPh: 'WhatsApp, phone, or email',
      postListingTitle: 'What do you need?',
      postListingTitlePh: 'e.g. Shawarma cook needed today',
      postListingCountry: 'Country (optional)',
      postListingCategory: 'Category (optional)',
      postListingDescription: 'Details (optional)',
      postListingSubmit: 'Submit for review',
      postListingMissing: 'Please fill in how to reach you and what you need.',
      postListingSuccess: "Thanks — we'll review this and post it if it looks good.",
      postListingFailed: 'Could not submit right now — please try again.',
      contactLink: 'Contact us',
      contactHint: 'Questions, feedback, or a problem with your account? Send us a message and we’ll reply by email.',
      contactName: 'Your name',
      contactEmail: 'Your email',
      contactMessage: 'Your message',
      contactSubmit: 'Send message',
      contactMissing: 'Please fill in your name, a valid email, and your message.',
      contactSuccess: "Thanks — we've got your message and will reply by email.",
      contactFailed: 'Could not send right now — please try again.',
      micStart: 'Record a voice note',
      micStop: 'Stop and transcribe',
      micDenied: 'Microphone access is off — allow it in your browser to record a voice note.',
      micUnavailable: 'This device or browser can\'t record — type your message instead.',
      voiceTranscribing: 'Transcribing your voice note…',
      voiceReady: 'Transcript is in the box — check it, then press Send.',
      voiceEmpty: 'That recording was empty — try again or type instead.',
      voiceFailed: 'Could not transcribe that recording — try again or type instead.',
      resendFailedFallback: 'Could not resend right now — try again.',
    },
    fr: {
      signOut: 'Se déconnecter',
      tabSignIn: 'Se connecter',
      tabCreateAccount: 'Créer un compte',
      authTitleWelcome: 'Content de vous revoir',
      authTitleCreate: 'Créez votre compte',
      authHint: "Yalla Nsafer s'adresse aux chercheurs d'emploi et d'immigration de 18 ans et plus. L'assistant vous met en contact avec de vraies opportunités — il ne remplace jamais un professionnel autorisé.",
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
      errAgeGate: 'Yalla Nsafer est réservé aux personnes de 18 ans et plus.',
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
      subscribeStripeBtn: "Payer par carte (Stripe)",
      sendBtn: 'Envoyer',
      jobsHeading: 'Opportunités correspondantes',
      jobsPlaceholder: "Envoyez un message pour voir ce que le moteur de recherche trouve — les offres affichées ici sont les seules que l'assistant est autorisé à mentionner.",
      noJobsMatched: 'Aucune opportunité ne correspond à ce message.',
      profileCompleteSearching: 'Votre profil est complet — envoyez votre prochain message et je chercherai de vraies offres pour vous.',
      viewPosting: "Voir l'offre ↗",
      welcomeSystemMessage: "Posez-moi des questions sur de vraies opportunités à l'étranger — les emplois, ce qu'exige une offre, ou si une offre semble sûre. Je réponds dans votre langue et votre dialecte.",
      demoModeNotice: "Mode démo — le modèle de l'assistant n'est pas encore configuré; affichage des résultats bruts.",
      networkError: 'Erreur réseau — veuillez réessayer.',
      errorPrefix: 'Erreur : ',
      subActiveRenews: 'Basique — actif (renouvellement le {date})',
      subActiveCanceled: "Basique — actif jusqu'au {date} (annulé, ne sera pas renouvelé)",
      checkoutPending: '…',
      checkoutUnavailable: 'Paiement indisponible',
      unverifiedFlagLabel: 'annonce non vérifiée — à vérifier vous-même',
      demoFlagLabel: 'annonce de démonstration — pas une offre réelle',
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
      postListingLink: 'Publier une annonce urgente — aucun compte requis',
      postListingHint: "Pour de l'aide rapide et informelle — « cuisinier chawarma recherché aujourd'hui ». Une personne vérifie chaque annonce avant publication; c'est distinct des opportunités correspondantes ci-dessus.",
      postListingContact: 'Comment peut-on vous joindre?',
      postListingContactPh: 'WhatsApp, téléphone ou courriel',
      postListingTitle: 'De quoi avez-vous besoin?',
      postListingTitlePh: "p. ex. Cuisinier chawarma recherché aujourd'hui",
      postListingCountry: 'Pays (facultatif)',
      postListingCategory: 'Catégorie (facultative)',
      postListingDescription: 'Détails (facultatifs)',
      postListingSubmit: 'Soumettre pour révision',
      postListingMissing: 'Veuillez indiquer comment vous joindre et ce dont vous avez besoin.',
      postListingSuccess: 'Merci — nous allons vérifier et publier si tout est en ordre.',
      postListingFailed: 'Impossible de soumettre pour le moment — veuillez réessayer.',
      contactLink: 'Nous joindre',
      contactHint: 'Des questions, des commentaires ou un problème avec votre compte? Écrivez-nous et nous répondrons par courriel.',
      contactName: 'Votre nom',
      contactEmail: 'Votre courriel',
      contactMessage: 'Votre message',
      contactSubmit: 'Envoyer le message',
      contactMissing: 'Veuillez indiquer votre nom, un courriel valide et votre message.',
      contactSuccess: 'Merci — nous avons reçu votre message et répondrons par courriel.',
      contactFailed: 'Impossible d’envoyer pour le moment — veuillez réessayer.',
      micStart: 'Enregistrer une note vocale',
      micStop: 'Arrêter et transcrire',
      micDenied: 'Le micro est bloqué — autorisez-le dans votre navigateur pour enregistrer une note vocale.',
      micUnavailable: 'Cet appareil ou navigateur ne peut pas enregistrer — écrivez votre message à la place.',
      voiceTranscribing: 'Transcription de votre note vocale…',
      voiceReady: 'La transcription est dans la boîte — vérifiez-la, puis appuyez sur Envoyer.',
      voiceEmpty: 'Cet enregistrement était vide — réessayez ou écrivez à la place.',
      voiceFailed: 'Impossible de transcrire cet enregistrement — réessayez ou écrivez à la place.',
      resendFailedFallback: 'Impossible de renvoyer pour le moment — réessayez.',
    },
    ar: {
      signOut: 'تسجيل الخروج',
      tabSignIn: 'تسجيل الدخول',
      tabCreateAccount: 'إنشاء حساب',
      authTitleWelcome: 'مرحبًا بعودتك',
      authTitleCreate: 'أنشئ حسابك',
      authHint: 'منصة يلا نسافر مخصصة للباحثين عن عمل والهجرة الذين تبلغ أعمارهم 18 عامًا فما فوق. يساعدك المساعد الذكي على إيجاد فرص حقيقية — ولا يحل أبدًا محل مختص مرخّص.',
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
      errAgeGate: 'منصة يلا نسافر مخصصة للأشخاص البالغين 18 عامًا فما فوق.',
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
      subscribeStripeBtn: 'الدفع بالبطاقة (Stripe)',
      sendBtn: 'إرسال',
      jobsHeading: 'الفرص المطابقة',
      jobsPlaceholder: 'أرسل رسالة لترى ما يجده محرك المطابقة — الوظائف المعروضة هنا هي الوحيدة التي يُسمح للمساعد بالإشارة إليها.',
      noJobsMatched: 'لا توجد فرص مطابقة لهذه الرسالة.',
      profileCompleteSearching: 'ملفك الشخصي مكتمل — أرسل رسالتك التالية وسأبحث عن فرص حقيقية من أجلك.',
      viewPosting: 'عرض الإعلان ↗',
      welcomeSystemMessage: 'اسألني عن فرص حقيقية في الخارج — الوظائف، ما تتطلبه إعلانات العمل، أو ما إذا كان العرض آمنًا. أجيبك بلغتك ولهجتك.',
      demoModeNotice: 'وضع تجريبي — لم يتم إعداد نموذج المساعد بعد؛ يتم عرض النتائج الأولية فقط.',
      networkError: 'خطأ في الشبكة — يرجى المحاولة مرة أخرى.',
      errorPrefix: 'خطأ: ',
      subActiveRenews: 'الباقة الأساسية — نشطة (يتجدد بتاريخ {date})',
      subActiveCanceled: 'الباقة الأساسية — نشطة حتى {date} (تم الإلغاء، لن تتجدد)',
      checkoutPending: '…',
      checkoutUnavailable: 'الدفع غير متاح',
      unverifiedFlagLabel: 'إعلان غير موثّق — يُرجى التحقق بنفسك',
      demoFlagLabel: 'إعلان تجريبي — ليست فرصة حقيقية',
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
      postListingLink: 'انشر إعلانًا عاجلاً — لا حاجة لحساب',
      postListingHint: '"للمساعدة السريعة وغير الرسمية — "مطلوب طاهي شاورما اليوم. يراجع أحد المشرفين كل إعلان قبل نشره؛ هذا منفصل عن قائمة الفرص المطابقة أعلاه.',
      postListingContact: 'كيف يمكن للناس التواصل معك؟',
      postListingContactPh: 'واتساب، هاتف، أو بريد إلكتروني',
      postListingTitle: 'ما الذي تحتاجه؟',
      postListingTitlePh: 'مثال: مطلوب طاهي شاورما اليوم',
      postListingCountry: 'الدولة (اختياري)',
      postListingCategory: 'الفئة (اختياري)',
      postListingDescription: 'تفاصيل (اختياري)',
      postListingSubmit: 'إرسال للمراجعة',
      postListingMissing: 'يرجى إدخال طريقة التواصل معك وما الذي تحتاجه.',
      postListingSuccess: 'شكرًا — سنراجع هذا وننشره إذا كان مناسبًا.',
      postListingFailed: 'تعذّر الإرسال الآن — يرجى المحاولة مرة أخرى.',
      contactLink: 'اتصل بنا',
      contactHint: 'أسئلة أو ملاحظات أو مشكلة في حسابك؟ أرسل لنا رسالة وسنرد عليك بالبريد الإلكتروني.',
      contactName: 'اسمك',
      contactEmail: 'بريدك الإلكتروني',
      contactMessage: 'رسالتك',
      contactSubmit: 'إرسال الرسالة',
      contactMissing: 'يرجى إدخال اسمك وبريد إلكتروني صحيح ورسالتك.',
      contactSuccess: 'شكرًا — وصلتنا رسالتك وسنرد عليك بالبريد الإلكتروني.',
      contactFailed: 'تعذّر الإرسال الآن — يرجى المحاولة مرة أخرى.',
      micStart: 'سجّل رسالة صوتية',
      micStop: 'أوقف وانسخ',
      micDenied: 'الميكروفون مغلق — اسمح له في متصفحك لتسجيل رسالة صوتية.',
      micUnavailable: 'هذا الجهاز أو المتصفح لا يستطيع التسجيل — اكتب رسالتك بدلًا من ذلك.',
      voiceTranscribing: 'جارٍ نسخ رسالتك الصوتية…',
      voiceReady: 'النسخ في المربع — راجعه ثم اضغط إرسال.',
      voiceEmpty: 'كان ذلك التسجيل فارغًا — حاول مجددًا أو اكتب بدلًا من ذلك.',
      voiceFailed: 'تعذّر نسخ ذلك التسجيل — حاول مجددًا أو اكتب بدلًا من ذلك.',
      resendFailedFallback: 'تعذّر إعادة الإرسال الآن — يرجى المحاولة مرة أخرى.',
    },
  };

  // Roadmap Step 1's other half: routes/auth.js, routes/concierge.js and
  // routes/subscription.js already stamp a stable `code` on every 4xx/5xx
  // JSON response (test/error-codes.test.js locks that contract in) — this
  // is the "map codes -> translated strings" step that was never built, so
  // the client kept showing the raw English `error` text regardless of the
  // chosen language. Deliberately NOT exhaustive: it only covers codes a
  // seeker can actually hit through public/index.html; a code with no entry
  // here falls back to the server's English text, same as before this map
  // existed (see tErr below and the file-header note on why server text
  // otherwise stays English pass-through).
  const ERRORS = {
    ERR_BAD_INPUT: {
      en: 'Please check the highlighted fields and try again.',
      fr: 'Veuillez vérifier les champs indiqués et réessayer.',
      ar: 'يرجى التحقق من الحقول المطلوبة والمحاولة مرة أخرى.',
    },
    ERR_BAD_EMAIL: {
      en: 'Please enter a valid email address.',
      fr: 'Veuillez saisir une adresse courriel valide.',
      ar: 'يرجى إدخال عنوان بريد إلكتروني صحيح.',
    },
    ERR_VOICE_UNAVAILABLE: {
      en: 'Voice notes are not available right now — type your message instead.',
      fr: 'Les notes vocales ne sont pas disponibles pour le moment — écrivez votre message à la place.',
      ar: 'الرسائل الصوتية غير متاحة الآن — اكتب رسالتك بدلًا من ذلك.',
    },
    ERR_TOO_LARGE: {
      en: 'That recording is too long — keep it under two minutes.',
      fr: 'Cet enregistrement est trop long — gardez-le sous deux minutes.',
      ar: 'هذا التسجيل طويل جدًا — اجعله أقل من دقيقتين.',
    },
    ERR_BAD_AUDIO_TYPE: {
      en: 'That audio format is not supported — try a different device or type instead.',
      fr: 'Ce format audio n’est pas pris en charge — essayez un autre appareil ou écrivez à la place.',
      ar: 'صيغة الصوت هذه غير مدعومة — جرّب جهازًا آخر أو اكتب بدلًا من ذلك.',
    },
    ERR_VOICE_EMPTY: {
      en: "We couldn't hear anything in that recording.",
      fr: 'Nous n’avons rien entendu dans cet enregistrement.',
      ar: 'لم نسمع شيئًا في ذلك التسجيل.',
    },
    ERR_VOICE_FAILED: {
      en: 'Could not transcribe that recording — try again or type instead.',
      fr: 'Impossible de transcrire cet enregistrement — réessayez ou écrivez à la place.',
      ar: 'تعذّر نسخ ذلك التسجيل — حاول مجددًا أو اكتب بدلًا من ذلك.',
    },
    ERR_WEAK_PASSWORD: {
      // one code covers all of lib/security.js's passwordProblem() outcomes:
      // too short, over 72 bytes, or a single repeated character
      en: 'Password must be at least 10 characters, under 72 bytes, and not a single repeated character.',
      fr: 'Le mot de passe doit contenir au moins 10 caractères, moins de 72 octets, et ne pas être un seul caractère répété.',
      ar: 'يجب أن تتكون كلمة المرور من 10 أحرف على الأقل وألا تتجاوز 72 بايت وألا تكون حرفًا واحدًا مكررًا.',
    },
    ERR_TERMS_REQUIRED: {
      en: 'Please accept the Terms of Use.',
      fr: "Veuillez accepter les conditions d'utilisation.",
      ar: 'يرجى الموافقة على شروط الاستخدام.',
    },
    ERR_AGE_GATE: {
      en: 'Yalla Nsafer is for people 18 and older.',
      fr: 'Yalla Nsafer est réservé aux personnes de 18 ans et plus.',
      ar: 'منصة يلا نسافر مخصصة للأشخاص البالغين 18 عامًا فما فوق.',
    },
    ERR_EMAIL_BLOCKED: {
      en: 'This email address cannot be used to register.',
      fr: "Cette adresse courriel ne peut pas être utilisée pour s'inscrire.",
      ar: 'لا يمكن استخدام هذا البريد الإلكتروني للتسجيل.',
    },
    ERR_INVALID_CREDENTIALS: {
      en: 'Invalid email or password.',
      fr: 'Courriel ou mot de passe invalide.',
      ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    },
    ERR_UNVERIFIED: {
      en: 'Please verify your email first.',
      fr: "Veuillez d'abord vérifier votre courriel.",
      ar: 'يرجى تأكيد بريدك الإلكتروني أولاً.',
    },
    ERR_SERVER: {
      en: 'Something went wrong on our end — please try again.',
      fr: "Une erreur s'est produite de notre côté — veuillez réessayer.",
      ar: 'حدث خطأ من جانبنا — يرجى المحاولة مرة أخرى.',
    },
    ERR_FORBIDDEN: {
      en: 'This action is not allowed.',
      fr: "Cette action n'est pas autorisée.",
      ar: 'هذا الإجراء غير مسموح به.',
    },
    ERR_NOT_FOUND: {
      en: 'Account not found.',
      fr: 'Compte introuvable.',
      ar: 'لم يتم العثور على الحساب.',
    },
    ERR_PAYWALL: {
      en: 'A subscription is required to use the concierge.',
      fr: "Un abonnement est requis pour utiliser l'assistant.",
      ar: 'الاشتراك مطلوب لاستخدام المساعد الذكي.',
    },
    ERR_QUOTA: {
      en: 'Daily limit reached — come back tomorrow or upgrade.',
      fr: 'Limite quotidienne atteinte — revenez demain ou abonnez-vous.',
      ar: 'تم الوصول إلى الحد اليومي — عد غدًا أو اشترك.',
    },
    ERR_UPSTREAM_UNAVAILABLE: {
      en: 'The assistant is temporarily unavailable — please try again shortly.',
      fr: "L'assistant est temporairement indisponible — veuillez réessayer sous peu.",
      ar: 'المساعد الذكي غير متاح مؤقتًا — يرجى المحاولة مرة أخرى بعد قليل.',
    },
    ERR_PAYMENT_UNAVAILABLE: {
      en: 'Payment is temporarily unavailable — please try again shortly.',
      fr: 'Le paiement est temporairement indisponible — veuillez réessayer sous peu.',
      ar: 'الدفع غير متاح مؤقتًا — يرجى المحاولة مرة أخرى بعد قليل.',
    },
    ERR_NO_ACTIVE_SUBSCRIPTION: {
      en: 'You have no active subscription to cancel.',
      fr: "Vous n'avez aucun abonnement actif à annuler.",
      ar: 'ليس لديك اشتراك نشط لإلغائه.',
    },
    ERR_INVALID_TOKEN: {
      en: 'Your session has expired — please sign in again.',
      fr: 'Votre session a expiré — veuillez vous reconnecter.',
      ar: 'انتهت صلاحية جلستك — يرجى تسجيل الدخول مرة أخرى.',
    },
    ERR_TOTP_REQUIRED: {
      en: 'Enter the code from your authenticator app.',
      fr: "Entrez le code de votre application d'authentification.",
      ar: 'أدخل الرمز من تطبيق المصادقة الخاص بك.',
    },
    ERR_INVALID_TOTP: {
      en: 'That authentication code is not correct.',
      fr: "Ce code d'authentification est incorrect.",
      ar: 'رمز المصادقة هذا غير صحيح.',
    },
    ERR_TOTP_ALREADY_ENABLED: {
      en: 'Two-factor authentication is already enabled on this account.',
      fr: "L'authentification à deux facteurs est déjà activée sur ce compte.",
      ar: 'المصادقة الثنائية مفعّلة بالفعل على هذا الحساب.',
    },
    ERR_TOTP_NOT_STARTED: {
      en: 'Start two-factor setup before confirming a code.',
      fr: "Démarrez la configuration à deux facteurs avant de confirmer un code.",
      ar: 'ابدأ إعداد المصادقة الثنائية قبل تأكيد الرمز.',
    },
    ERR_TOTP_NOT_ENABLED: {
      en: 'Two-factor authentication is not enabled on this account.',
      fr: "L'authentification à deux facteurs n'est pas activée sur ce compte.",
      ar: 'المصادقة الثنائية غير مفعّلة على هذا الحساب.',
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

  // Looks up a server error `code` in the ERRORS map for the given language;
  // returns null (not the code itself) when the code is unknown, so callers
  // can fall back to the server's own English `error` text — never render a
  // bare ERR_* constant to a user.
  function tErr(lang, code) {
    const entry = code && ERRORS[code];
    if (!entry) return null;
    return entry[lang] || entry.en;
  }

  return { STRINGS, LANGS, isRTL, t, tErr };
});
