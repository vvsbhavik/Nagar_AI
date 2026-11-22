import { Check, Globe } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type AppLanguage = 'en' | 'te' | 'hi' | 'ta' | 'kn';

export interface LanguageOption {
  code: AppLanguage;
  nativeLabel: string;
  englishLabel: string;
  shortCode: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeLabel: 'English', englishLabel: 'English', shortCode: 'EN' },
  { code: 'te', nativeLabel: 'తెలుగు', englishLabel: 'Telugu', shortCode: 'తె' },
  { code: 'hi', nativeLabel: 'हिन्दी', englishLabel: 'Hindi', shortCode: 'हि' },
  { code: 'ta', nativeLabel: 'தமிழ்', englishLabel: 'Tamil', shortCode: 'த' },
  { code: 'kn', nativeLabel: 'ಕನ್ನಡ', englishLabel: 'Kannada', shortCode: 'ಕ' },
];

type TranslationDict = Record<string, string>;

const TRANSLATIONS: Record<AppLanguage, TranslationDict> = {
  en: {
    brandName: 'NagarAI',
    tagline: 'From Citizen Voice to Government Action.',
    civicIntelligence: 'Civic Intelligence Platform',
    navOverview: 'Overview',
    navLiveMap: 'Live Map',
    navWardIndex: 'Ward Index',
    navResolutions: 'Resolutions',
    navTrends: 'Civic Trends',
    navCitizenOverview: 'Citizen Overview',
    navReportIssue: 'Report an Issue',
    navMyComplaints: 'My Complaints',
    navWardOps: 'Ward Operations',
    navFieldTasks: 'Field Tasks',
    navCommandCenter: 'Command Center',
    navPublicPortal: 'Public Transparency',
    navAiAssistant: 'AI Civic Assistant',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    switchAccount: 'Switch Account',
    createAccount: 'Register Citizen',
    reportProblemBtn: 'Report an Issue',
    askAiBtn: 'Ask AI Assistant',
    publicPortalEyebrow: 'Open Civic Transparency Portal · No Login Required',
    publicHeroSubtitle:
      'Report infrastructure problems with photo or Telugu/English voice. NagarAI identifies your ward boundary, routes to the responsible department, tracks field execution, and verifies every repair publicly.',
    exploreLiveMap: 'Explore Live Map',
    signInToReport: 'Sign In to Report or Manage',
    pipelineLocation: 'Location',
    pipelineWard: 'Ward',
    pipelineAuthority: 'Authority',
    pipelineAction: 'Action',
    pipelineAccountability: 'Accountability',
    kpiTotalComplaints: 'Total Complaints',
    kpiActiveComplaints: 'Active Complaints',
    kpiResolvedComplaints: 'Resolved Complaints',
    kpiNeedsAttention: 'Needs Attention',
    kpiVerifiedResolutions: 'Verified Resolutions',
    kpiResolutionRate: 'Resolution Rate',
    kpiAvgResolution: 'Avg Resolution Time',
    kpiAvgResponse: 'Avg Response Time',
    kpiOpenIssues: 'Open Civic Issues',
    kpiCriticalIssues: 'Critical Issues',
    kpiOverdueIssues: 'Overdue Issues',
    kpiResolvedMonth: 'Resolved This Month',
    kpiPending: 'Pending',
    roleCitizen: 'Citizen',
    roleWardRep: 'Ward Representative',
    roleFieldOfficer: 'Field Officer',
    roleMunicipalAdmin: 'Municipal Administrator',
    rolePublicObserver: 'Public Observer',
    authWelcomeTitle: 'Sign in to NagarAI',
    authWelcomeSub: 'Enter your credentials to open your assigned civic workspace.',
    authEmailLabel: 'Email Address',
    authPasswordLabel: 'Password',
    authFullNameLabel: 'Full Name',
    authHomeWardLabel: 'Home Ward (Demo Boundary)',
    authSignInSubmit: 'Sign In to Workspace',
    authRegisterSubmit: 'Create Citizen Account',
    authDemoDirectoryTitle: 'Trial Demo Accounts (All 4 Authenticated Roles)',
    authDemoDirectorySub:
      'Use these clearly labeled trial credentials to evaluate each connected role on the shared database.',
    authFillBtn: 'Fill',
    authQuickEnterBtn: 'Trial Sign In',
    authBackToSite: 'Back to Public Website',
    privacyNotice:
      'Privacy-Protected Open Feed: Reporter names, contact numbers, and exact pinpoint coordinates are anonymized (~110m radius).',
    demoDatasetBadge: 'Demo Municipal Dataset & Demo Ward Boundaries',
    recentComplaints: 'Recent Complaints',
    latestTimeline: 'Latest Complaint Status Timeline',
    nearbyIssuesMap: 'Nearby Civic Issues Map',
    wardHealthTitle: 'Ward Health & Support Index',
    cityTrendsTitle: 'Citywide Civic Trends',
    verifiedShowcaseTitle: 'Verified Resolutions & Evidence Transparency',
    categoryDistTitle: 'Issues by Civic Category',
  },
  te: {
    brandName: 'నగర్AI (NagarAI)',
    tagline: 'పౌర గొంతుక నుండి ప్రభుత్వ చర్య వరకు.',
    civicIntelligence: 'పౌర మేధస్సు వేదిక',
    navOverview: 'సారాంశం',
    navLiveMap: 'లైవ్ మ్యాప్',
    navWardIndex: 'వార్డు సూచిక',
    navResolutions: 'పరిష్కారాలు',
    navTrends: 'నగర ధోరణులు',
    navCitizenOverview: 'పౌర డాష్‌బోర్డ్',
    navReportIssue: 'సమస్యను నివేదించండి',
    navMyComplaints: 'నా ఫిర్యాదులు',
    navWardOps: 'వార్డు కార్యకలాపాలు',
    navFieldTasks: 'ఫీల్డ్ పనులు',
    navCommandCenter: 'కమాండ్ సెంటర్',
    navPublicPortal: 'ప్రజా పారదర్శకత',
    navAiAssistant: 'AI పౌర సహాయకుడు',
    signIn: 'సైన్ ఇన్',
    signOut: 'సైన్ అవుట్',
    switchAccount: 'ఖాతా మార్చండి',
    createAccount: 'పౌర నమోదు',
    reportProblemBtn: 'సమస్యను నివేదించండి',
    askAiBtn: 'AI సహాయకుడిని అడగండి',
    publicPortalEyebrow: 'ప్రజా పారదర్శకత పోర్టల్ · లాగిన్ అవసరం లేదు',
    publicHeroSubtitle:
      'ఫోటో లేదా తెలుగు/ఇంగ్లీష్ వాయిస్‌తో నగర సమస్యలను నివేదించండి. NagarAI మీ వార్డు సరిహద్దును గుర్తించి, సంబంధిత శాఖకు పంపి, మరమ్మత్తును పారదర్శకంగా ట్రాక్ చేస్తుంది.',
    exploreLiveMap: 'లైవ్ మ్యాప్ చూడండి',
    signInToReport: 'నివేదించడానికి సైన్ ఇన్ చేయండి',
    pipelineLocation: 'ప్రాంతం',
    pipelineWard: 'వార్డు',
    pipelineAuthority: 'అధికారి',
    pipelineAction: 'చర్య',
    pipelineAccountability: 'జవాబుదారీతనం',
    kpiTotalComplaints: 'మొత్తం ఫిర్యాదులు',
    kpiActiveComplaints: 'యాక్టివ్ ఫిర్యాదులు',
    kpiResolvedComplaints: 'పరిష్కరించినవి',
    kpiNeedsAttention: 'దృష్టి అవసరం',
    kpiVerifiedResolutions: 'ధృవీకరించిన పరిష్కారాలు',
    kpiResolutionRate: 'పరిష్కార రేటు',
    kpiAvgResolution: 'సగటు పరిష్కార సమయం',
    kpiAvgResponse: 'సగటు స్పందన సమయం',
    kpiOpenIssues: 'పెండింగ్ సమస్యలు',
    kpiCriticalIssues: 'క్లిష్టమైన సమస్యలు',
    kpiOverdueIssues: 'గడువు దాటినవి',
    kpiResolvedMonth: 'ఈ నెలలో పరిష్కరించినవి',
    kpiPending: 'పెండింగ్',
    roleCitizen: 'పౌరుడు',
    roleWardRep: 'వార్డు ప్రతినిధి',
    roleFieldOfficer: 'ఫీల్డ్ అధికారి',
    roleMunicipalAdmin: 'మున్సిపల్ అడ్మినిస్ట్రేటర్',
    rolePublicObserver: 'ప్రజా పరిశీలకుడు',
    authWelcomeTitle: 'NagarAI లో సైన్ ఇన్ చేయండి',
    authWelcomeSub: 'మీ పాత్రకు సంబంధించిన డాష్‌బోర్డ్‌ను తెరవడానికి వివరాలు నమోదు చేయండి.',
    authEmailLabel: 'ఇమెయిల్ చిరునామా',
    authPasswordLabel: 'పాస్‌వర్డ్',
    authFullNameLabel: 'పూర్తి పేరు',
    authHomeWardLabel: 'మీ వార్డు (డెమో సరిహద్దు)',
    authSignInSubmit: 'డాష్‌బోర్డ్‌లో సైన్ ఇన్ చేయండి',
    authRegisterSubmit: 'పౌర ఖాతా సృష్టించండి',
    authDemoDirectoryTitle: 'ట్రయల్ డెమో ఖాతాలు (అన్ని 4 పాత్రలు)',
    authDemoDirectorySub:
      'పరీక్ష కోసం క్రింది డెమో ఖాతాలను క్లిక్ చేసి ప్రతి పాత్రను సులభంగా ప్రయత్నించండి.',
    authFillBtn: 'పూరించండి',
    authQuickEnterBtn: 'ట్రయల్ సైన్ ఇన్',
    authBackToSite: 'ప్రజా వెబ్‌సైట్‌కు తిరిగి వెళ్ళండి',
    privacyNotice:
      'గోప్యత రక్షిత ప్రజా డేటా: ఫిర్యాదుదారుల పేర్లు, ఫోన్ నంబర్లు మరియు ఖచ్చితమైన ఇంటి స్థానం గోప్యంగా ఉంచబడతాయి.',
    demoDatasetBadge: 'డెమో మున్సిపల్ డేటా & డెమో వార్డు సరిహద్దులు',
    recentComplaints: 'ఇటీవలి ఫిర్యాదులు',
    latestTimeline: 'తాజా ఫిర్యాదు స్థితి టైమ్‌లైన్',
    nearbyIssuesMap: 'సమీప పౌర సమస్యల మ్యాప్',
    wardHealthTitle: 'వార్డు ఆరోగ్య & మద్దతు సూచిక',
    cityTrendsTitle: 'నగర పౌర ధోరణులు',
    verifiedShowcaseTitle: 'ధృవీకరించిన పరిష్కారాలు & ఆధారాలు',
    categoryDistTitle: 'వర్గం వారీగా సమస్యలు',
  },
  hi: {
    brandName: 'नगरAI (NagarAI)',
    tagline: 'नागरिक की आवाज़ से सरकारी कार्रवाई तक।',
    civicIntelligence: 'नागरिक इंटेलिजेंस प्लेटफ़ॉर्म',
    navOverview: 'सारांश',
    navLiveMap: 'लाइव मैप',
    navWardIndex: 'वार्ड सूचकांक',
    navResolutions: 'समाधान',
    navTrends: 'शहर के रुझान',
    navCitizenOverview: 'नागरिक डैशबोर्ड',
    navReportIssue: 'समस्या दर्ज करें',
    navMyComplaints: 'मेरी शिकायतें',
    navWardOps: 'वार्ड संचालन',
    navFieldTasks: 'फील्ड कार्य',
    navCommandCenter: 'कमांड सेंटर',
    navPublicPortal: 'सार्वजनिक पारदर्शिता',
    navAiAssistant: 'AI नागरिक सहायक',
    signIn: 'साइन इन',
    signOut: 'साइन आउट',
    switchAccount: 'खाता बदलें',
    createAccount: 'नागरिक पंजीकरण',
    reportProblemBtn: 'समस्या दर्ज करें',
    askAiBtn: 'AI सहायक से पूछें',
    publicPortalEyebrow: 'सार्वजनिक पारदर्शिता पोर्टल · लॉगिन आवश्यक नहीं',
    publicHeroSubtitle:
      'फ़ोटो या आवाज़ से शहरी समस्याओं की रिपोर्ट करें। NagarAI आपके वार्ड की पहचान करता है, सही विभाग को भेजता है और हर मरम्मत को पारदर्शी रूप से ट्रैक करता है।',
    exploreLiveMap: 'लाइव मैप देखें',
    signInToReport: 'रिपोर्ट या प्रबंधन के लिए साइन इन करें',
    pipelineLocation: 'स्थान',
    pipelineWard: 'वार्ड',
    pipelineAuthority: 'अधिकारी',
    pipelineAction: 'कार्रवाई',
    pipelineAccountability: 'जवाबदेही',
    kpiTotalComplaints: 'कुल शिकायतें',
    kpiActiveComplaints: 'सक्रिय शिकायतें',
    kpiResolvedComplaints: 'हल की गई',
    kpiNeedsAttention: 'ध्यान आवश्यक',
    kpiVerifiedResolutions: 'सत्यापित समाधान',
    kpiResolutionRate: 'समाधान दर',
    kpiAvgResolution: 'औसत समाधान समय',
    kpiAvgResponse: 'औसत प्रतिक्रिया समय',
    kpiOpenIssues: 'लंबित समस्याएं',
    kpiCriticalIssues: 'गंभीर समस्याएं',
    kpiOverdueIssues: 'समय-सीमा पार',
    kpiResolvedMonth: 'इस माह हल हुईं',
    kpiPending: 'लंबित',
    roleCitizen: 'नागरिक',
    roleWardRep: 'वार्ड प्रतिनिधि',
    roleFieldOfficer: 'फील्ड अधिकारी',
    roleMunicipalAdmin: 'नगर प्रशासक',
    rolePublicObserver: 'सार्वजनिक दर्शक',
    authWelcomeTitle: 'NagarAI में साइन इन करें',
    authWelcomeSub: 'अपनी भूमिका के डैशबोर्ड तक पहुंचने के लिए लॉग इन करें।',
    authEmailLabel: 'ईमेल पता',
    authPasswordLabel: 'पासवर्ड',
    authFullNameLabel: 'पूरा नाम',
    authHomeWardLabel: 'होम वार्ड (डेमो सीमा)',
    authSignInSubmit: 'वर्कस्पेस में साइन इन करें',
    authRegisterSubmit: 'नागरिक खाता बनाएं',
    authDemoDirectoryTitle: 'ट्रायल डेमो खाते (सभी 4 भूमिकाएं)',
    authDemoDirectorySub:
      'परीक्षण के लिए नीचे दिए गए किसी भी डेमो खाते से तुरंत लॉग इन करें या विवरण भरें।',
    authFillBtn: 'भरें',
    authQuickEnterBtn: 'ट्रायल साइन इन',
    authBackToSite: 'सार्वजनिक वेबसाइट पर लौटें',
    privacyNotice:
      'गोपनीयता सुरक्षित फ़ीड: नागरिक नाम, संपर्क और सटीक घर का पता स्वचालित रूप से छिपाया जाता है।',
    demoDatasetBadge: 'डेमो नगर डेटा और डेमो वार्ड सीमाएं',
    recentComplaints: 'हाल की शिकायतें',
    latestTimeline: 'नवीनतम शिकायत स्थिति टाइमलाइन',
    nearbyIssuesMap: 'आसपास की नागरिक समस्याओं का मानचित्र',
    wardHealthTitle: 'वार्ड स्वास्थ्य एवं सहायता सूचकांक',
    cityTrendsTitle: 'शहरव्यापी नागरिक रुझान',
    verifiedShowcaseTitle: 'सत्यापित समाधान और प्रमाण',
    categoryDistTitle: 'श्रेणी के अनुसार समस्याएं',
  },
  ta: {
    brandName: 'நகர்AI (NagarAI)',
    tagline: 'குடிமக்களின் குரலிலிருந்து அரசு நடவடிக்கை வரை.',
    civicIntelligence: 'நகர்ப்புற நுண்ணறிவு தளம்',
    navOverview: 'சுருக்கம்',
    navLiveMap: 'நேரடி வரைபடம்',
    navWardIndex: 'வார்டு குறியீடு',
    navResolutions: 'தீர்வுகள்',
    navTrends: 'நகரப் போக்குகள்',
    navCitizenOverview: 'குடிமகன் முகப்பு',
    navReportIssue: 'புகார் அளிக்கவும்',
    navMyComplaints: 'எனது புகார்கள்',
    navWardOps: 'வார்டு செயல்பாடுகள்',
    navFieldTasks: 'களப் பணிகள்',
    navCommandCenter: 'கட்டளை மையம்',
    navPublicPortal: 'பொது வெளிப்படைத்தன்மை',
    navAiAssistant: 'AI நகர உதவியாளர்',
    signIn: 'உள்நுழைக',
    signOut: 'வெளியேறு',
    switchAccount: 'கணக்கை மாற்று',
    createAccount: 'குடிமகன் பதிவு',
    reportProblemBtn: 'புகார் அளிக்கவும்',
    askAiBtn: 'AI உதவியாளரிடம் கேளுங்கள்',
    publicPortalEyebrow: 'பொது வெளிப்படைத்தன்மை தளம் · உள்நுழைவு தேவையில்லை',
    publicHeroSubtitle:
      'புகைப்படம் அல்லது குரல் மூலம் நகரப் பிரச்சனைகளைப் புகாரளிக்கவும். NagarAI உங்கள் வார்டை அடையாளம் கண்டு, சரியான துறைக்கு அனுப்பி, தீர்வை உறுதி செய்கிறது.',
    exploreLiveMap: 'வரைபடத்தைப் பார்க்கவும்',
    signInToReport: 'புகார் அளிக்க உள்நுழைக',
    pipelineLocation: 'இடம்',
    pipelineWard: 'வார்டு',
    pipelineAuthority: 'அதிகாரி',
    pipelineAction: 'நடவடிக்கை',
    pipelineAccountability: 'பொறுப்புக்கூறல்',
    kpiTotalComplaints: 'மொத்த புகார்கள்',
    kpiActiveComplaints: 'செயலில் உள்ளவை',
    kpiResolvedComplaints: 'தீர்க்கப்பட்டவை',
    kpiNeedsAttention: 'கவனம் தேவை',
    kpiVerifiedResolutions: 'சரிபார்க்கப்பட்ட தீர்வுகள்',
    kpiResolutionRate: 'தீர்வு விகிதம்',
    kpiAvgResolution: 'சராசரி தீர்வு நேரம்',
    kpiAvgResponse: 'சராசரி பதில் நேரம்',
    kpiOpenIssues: 'நிலுவையில் உள்ளவை',
    kpiCriticalIssues: 'அவசரப் பிரச்சனைகள்',
    kpiOverdueIssues: 'காலம் கடந்தவை',
    kpiResolvedMonth: 'இந்த மாதம் தீர்ந்தவை',
    kpiPending: 'நிலுவை',
    roleCitizen: 'குடிமகன்',
    roleWardRep: 'வார்டு பிரதிநிதி',
    roleFieldOfficer: 'கள அதிகாரி',
    roleMunicipalAdmin: 'நகராட்சி நிர்வாகி',
    rolePublicObserver: 'பொதுப் பார்வையாளர்',
    authWelcomeTitle: 'NagarAI இல் உள்நுழையவும்',
    authWelcomeSub: 'உங்கள் பங்குக்குரிய கட்டுப்பாட்டுப் பலகையைத் திறக்க உள்நுழையவும்.',
    authEmailLabel: 'மின்னஞ்சல் முகவரி',
    authPasswordLabel: 'கடவுச்சொல்',
    authFullNameLabel: 'முழுப் பெயர்',
    authHomeWardLabel: 'உங்கள் வார்டு (டெமோ)',
    authSignInSubmit: 'உள்நுழையவும்',
    authRegisterSubmit: 'குடிமகன் கணக்கை உருவாக்கு',
    authDemoDirectoryTitle: 'சோதனை டெமோ கணக்குகள் (அனைத்து 4 பங்குகள்)',
    authDemoDirectorySub:
      'சோதனைக்காக கீழே உள்ள டெமோ கணக்குகளில் ஒன்றைத் தேர்ந்தெடுத்து உடனே அணுகலாம்.',
    authFillBtn: 'நிரப்பு',
    authQuickEnterBtn: 'சோதனை உள்நுழைவு',
    authBackToSite: 'பொது தளத்திற்குத் திரும்பு',
    privacyNotice:
      'தனியுரிமை பாதுகாக்கப்பட்ட பொதுத் தரவு: தனிப்பட்ட பெயர்கள் மற்றும் துல்லியமான வீட்டு முகவரி மறைக்கப்பட்டுள்ளன.',
    demoDatasetBadge: 'டெமோ நகராட்சி தரவு & வார்டு எல்லைகள்',
    recentComplaints: 'சமீபத்திய புகார்கள்',
    latestTimeline: 'சமீபத்திய புகார் நிலை காலவரிசை',
    nearbyIssuesMap: 'அருகிலுள்ள புகார்கள் வரைபடம்',
    wardHealthTitle: 'வார்டு நலன் & ஆதரவு குறியீடு',
    cityTrendsTitle: 'நகரளாவிய புகார் போக்குகள்',
    verifiedShowcaseTitle: 'சரிபார்க்கப்பட்ட தீர்வுகள்',
    categoryDistTitle: 'வகை வாரியான புகார்கள்',
  },
  kn: {
    brandName: 'ನಗರAI (NagarAI)',
    tagline: 'ನಾಗರಿಕರ ಧ್ವನಿಯಿಂದ ಸರ್ಕಾರಿ ಕ್ರಮದವರೆಗೆ.',
    civicIntelligence: 'ನಾಗರಿಕ ಬುದ್ಧಿಮತ್ತೆ ವೇದಿಕೆ',
    navOverview: 'ಸಾರಾಂಶ',
    navLiveMap: 'ಲೈವ್ ನಕ್ಷೆ',
    navWardIndex: 'ವಾರ್ಡ್ ಸೂಚ್ಯಂಕ',
    navResolutions: 'ಪರಿಹಾರಗಳು',
    navTrends: 'ನಗರ ಪ್ರವೃತ್ತಿಗಳು',
    navCitizenOverview: 'ನಾಗರಿಕ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    navReportIssue: 'ಸಮಸ್ಯೆ ವರದಿ ಮಾಡಿ',
    navMyComplaints: 'ನನ್ನ ದೂರುಗಳು',
    navWardOps: 'ವಾರ್ಡ್ ಕಾರ್ಯಾಚರಣೆ',
    navFieldTasks: 'ಕ್ಷೇತ್ರ ಕಾರ್ಯಗಳು',
    navCommandCenter: 'ಕಮಾಂಡ್ ಸೆಂಟರ್',
    navPublicPortal: 'ಸಾರ್ವಜನಿಕ ಪಾರದರ್ಶಕತೆ',
    navAiAssistant: 'AI ನಾಗರಿಕ ಸಹಾಯಕ',
    signIn: 'ಸೈನ್ ಇನ್',
    signOut: 'ಸೈನ್ ಔಟ್',
    switchAccount: 'ಖಾತೆ ಬದಲಿಸಿ',
    createAccount: 'ನಾಗರಿಕ ನೋಂದಣಿ',
    reportProblemBtn: 'ಸಮಸ್ಯೆ ವರದಿ ಮಾಡಿ',
    askAiBtn: 'AI ಸಹಾಯಕರನ್ನು ಕೇಳಿ',
    publicPortalEyebrow: 'ಸಾರ್ವಜನಿಕ ಪಾರದರ್ಶಕತೆ ಪೋರ್ಟಲ್ · ಲಾಗಿನ್ ಅಗತ್ಯವಿಲ್ಲ',
    publicHeroSubtitle:
      'ಫೋಟೋ ಅಥವಾ ಧ್ವನಿಯ ಮೂಲಕ ನಗರದ ಸಮಸ್ಯೆಗಳನ್ನು ವರದಿ ಮಾಡಿ. NagarAI ನಿಮ್ಮ ವಾರ್ಡ್ ಗುರುತಿಸಿ, ಸಂಬಂಧಿತ ಇಲಾಖೆಗೆ ಕಳುಹಿಸಿ, ಪ್ರತಿ ದುರಸ್ತಿಯನ್ನು ಪಾರದರ್ಶಕವಾಗಿ ಟ್ರ್ಯಾಕ್ ಮಾಡುತ್ತದೆ.',
    exploreLiveMap: 'ಲೈವ್ ನಕ್ಷೆ ನೋಡಿ',
    signInToReport: 'ವರದಿ ಮಾಡಲು ಸೈನ್ ಇನ್ ಮಾಡಿ',
    pipelineLocation: 'ಸ್ಥಳ',
    pipelineWard: 'ವಾರ್ಡ್',
    pipelineAuthority: 'ಅಧಿಕಾರಿ',
    pipelineAction: 'ಕ್ರಮ',
    pipelineAccountability: 'ಹೊಣೆಗಾರಿಕೆ',
    kpiTotalComplaints: 'ಒಟ್ಟು ದೂರುಗಳು',
    kpiActiveComplaints: 'ಸಕ್ರಿಯ ದೂರುಗಳು',
    kpiResolvedComplaints: 'ಪರಿಹರಿಸಿದವು',
    kpiNeedsAttention: 'ಗಮನ ಅಗತ್ಯ',
    kpiVerifiedResolutions: 'ದೃಢೀಕರಿಸಿದ ಪರಿಹಾರಗಳು',
    kpiResolutionRate: 'ಪರಿಹಾರ ದರ',
    kpiAvgResolution: 'ಸರಾಸರಿ ಪರಿಹಾರ ಸಮಯ',
    kpiAvgResponse: 'ಸರಾಸರಿ ಪ್ರತಿಕ್ರಿಯೆ ಸಮಯ',
    kpiOpenIssues: 'ಬಾಕಿ ಸಮಸ್ಯೆಗಳು',
    kpiCriticalIssues: 'ಗಂಭೀರ ಸಮಸ್ಯೆಗಳು',
    kpiOverdueIssues: 'ಅವಧಿ ಮೀರಿದವು',
    kpiResolvedMonth: 'ಈ ತಿಂಗಳು ಪರಿಹರಿಸಿದವು',
    kpiPending: 'ಬಾಕಿ',
    roleCitizen: 'ನಾಗರಿಕ',
    roleWardRep: 'ವಾರ್ಡ್ ಪ್ರತಿನಿಧಿ',
    roleFieldOfficer: 'ಕ್ಷೇತ್ರ ಅಧಿಕಾರಿ',
    roleMunicipalAdmin: 'ನಗರ ಆಡಳಿತಾಧಿಕಾರಿ',
    rolePublicObserver: 'ಸಾರ್ವಜನಿಕ ವೀಕ್ಷಕ',
    authWelcomeTitle: 'NagarAI ಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ',
    authWelcomeSub: 'ನಿಮ್ಮ ಪಾತ್ರದ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ತೆರೆಯಲು ಲಾಗಿನ್ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ.',
    authEmailLabel: 'ಇಮೇಲ್ ವಿಳಾಸ',
    authPasswordLabel: 'ಪಾಸ್‌ವರ್ಡ್',
    authFullNameLabel: 'ಪೂರ್ಣ ಹೆಸರು',
    authHomeWardLabel: 'ನಿಮ್ಮ ವಾರ್ಡ್ (ಡೆಮೊ)',
    authSignInSubmit: 'ಸೈನ್ ಇನ್ ಮಾಡಿ',
    authRegisterSubmit: 'ನಾಗರಿಕ ಖಾತೆ ರಚಿಸಿ',
    authDemoDirectoryTitle: 'ಪ್ರಾಯೋಗಿಕ ಡೆಮೊ ಖಾತೆಗಳು (ಎಲ್ಲಾ 4 ಪಾತ್ರಗಳು)',
    authDemoDirectorySub:
      'ಪ್ರಾಯೋಗಿಕ ಪರೀಕ್ಷೆಗಾಗಿ ಕೆಳಗಿನ ಯಾವುದೇ ಡೆಮೊ ಖಾತೆಯನ್ನು ಬಳಸಿ ತಕ್ಷಣ ಪ್ರವೇಶಿಸಿ.',
    authFillBtn: 'ತುಂಬಿಸಿ',
    authQuickEnterBtn: 'ಪ್ರಾಯೋಗಿಕ ಲಾಗಿನ್',
    authBackToSite: 'ಸಾರ್ವಜನಿಕ ವೆಬ್‌ಸೈಟ್‌ಗೆ ಹಿಂತಿರುಗಿ',
    privacyNotice:
      'ಗೌಪ್ಯತೆ-ರಕ್ಷಿತ ಸಾರ್ವಜನಿಕ ಮಾಹಿತಿ: ನಾಗರಿಕರ ಹೆಸರು, ಫೋನ್ ಮತ್ತು ನಿಖರ ಮನೆ ಸ್ಥಳವನ್ನು ಮರೆಮಾಡಲಾಗಿದೆ.',
    demoDatasetBadge: 'ಡೆಮೊ ನಗರ ಡೇಟಾ ಮತ್ತು ವಾರ್ಡ್ ಗಡಿಗಳು',
    recentComplaints: 'ಇತ್ತೀಚಿನ ದೂರುಗಳು',
    latestTimeline: 'ಇತ್ತೀಚಿನ ದೂರು ಸ್ಥಿತಿ ಟೈಮ್‌ಲೈನ್',
    nearbyIssuesMap: 'ಹತ್ತಿರದ ನಾಗರಿಕ ಸಮಸ್ಯೆಗಳ ನಕ್ಷೆ',
    wardHealthTitle: 'ವಾರ್ಡ್ ಆರೋಗ್ಯ ಮತ್ತು ಬೆಂಬಲ ಸೂಚ್ಯಂಕ',
    cityTrendsTitle: 'ನಗರವ್ಯಾಪಿ ನಾಗರಿಕ ಪ್ರವೃತ್ತಿಗಳು',
    verifiedShowcaseTitle: 'ದೃಢೀಕರಿಸಿದ ಪರಿಹಾರಗಳು ಮತ್ತು ಪುರಾವೆ',
    categoryDistTitle: 'ವಿಭಾಗವಾರು ಸಮಸ್ಯೆಗಳು',
  },
};

interface I18nContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  t: (key: string) => string;
  currentLanguageOption: LanguageOption;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const saved = window.localStorage.getItem('nagarai_lang') as AppLanguage | null;
      if (saved && TRANSLATIONS[saved]) return saved;
    } catch {
      /* ignore */
    }
    return 'en';
  });

  const setLang = (next: AppLanguage) => {
    setLangState(next);
    try {
      window.localStorage.setItem('nagarai_lang', next);
    } catch {
      /* ignore */
    }
  };

  const t = (key: string) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
  const currentLanguageOption = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <I18nContext.Provider value={{ lang, setLang, t, currentLanguageOption }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, currentLanguageOption } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DAD2] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#181C19] transition-colors hover:border-[#0F7B55] hover:text-[#0F7B55] whitespace-nowrap shrink-0"
        aria-label="Select application language"
        aria-expanded={open}
      >
        <Globe className="h-3.5 w-3.5 text-[#0F7B55]" />
        <span>{compact ? currentLanguageOption.shortCode : currentLanguageOption.nativeLabel}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-[1200] mt-2 w-48 rounded-xl border border-[#E4E4DD] bg-white p-1.5 shadow-xl">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[#5A635D]">
            Display Language
          </div>
          {LANGUAGES.map((opt) => {
            const active = opt.code === lang;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  setLang(opt.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  active
                    ? 'bg-[#113829]/8 font-semibold text-[#113829]'
                    : 'text-[#181C19] hover:bg-[#F7F7F4]'
                }`}
              >
                <span>
                  {opt.nativeLabel}{' '}
                  {opt.code !== 'en' && (
                    <span className="text-[#5A635D]">({opt.englishLabel})</span>
                  )}
                </span>
                {active && <Check className="h-3.5 w-3.5 text-[#0F7B55]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
