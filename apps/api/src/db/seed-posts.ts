import sharp from "sharp";
import { connectMongo } from "./mongo.js";
import { Post } from "./models/post.model.js";
import { Issue } from "./models/issue.model.js";
import { PlatformDb } from "./platform-db.js";
import { TenantDb } from "./tenant-db.js";
import { processAndStoreMedia } from "../services/media-service.js";
import type { Block } from "@nivaran/shared";

interface PostSeedDefinition {
  slug: string;
  categoryCode: string;
  color: string;
  iconSymbol: string;
  tags: string[];
  daysAgo: number;
  title: Record<string, string>;
  summary: Record<string, string>;
  generateBlocks: (mediaId: string, issuePublicId?: string) => Record<string, Block[]>;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function generateSeedImage(
  title: string,
  color: string,
  iconSymbol: string
): Promise<Buffer> {
  const safeTitle = escapeXml(title);
  const safeIcon = escapeXml(iconSymbol);
  const svg = `
  <svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="900" fill="#18191a"/>
    <!-- Road lane markings -->
    <line x1="0" y1="100" x2="1600" y2="100" stroke="#f5c000" stroke-width="14" stroke-dasharray="60 30"/>
    <line x1="0" y1="800" x2="1600" y2="800" stroke="#ffffff" stroke-width="8" opacity="0.3"/>
    
    <!-- Milestone stone graphic -->
    <path d="M 800,240 C 700,240 620,320 620,420 L 620,640 L 980,640 L 980,420 C 980,320 900,240 800,240 Z" fill="#2b2d30" stroke="${color}" stroke-width="10"/>
    <path d="M 800,240 C 700,240 620,320 620,420 L 980,420 C 980,320 900,240 800,240 Z" fill="${color}"/>
    
    <!-- Stone text -->
    <text x="800" y="360" font-family="monospace" font-size="48" font-weight="bold" fill="#18191a" text-anchor="middle">NIVARAN</text>
    <text x="800" y="550" font-family="sans-serif" font-size="72" font-weight="bold" fill="#ffffff" text-anchor="middle">${safeIcon}</text>
    
    <!-- Banner with title -->
    <rect x="80" y="680" width="1440" height="100" rx="8" fill="#0d0e0f" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
    <text x="800" y="744" font-family="sans-serif" font-size="36" font-weight="bold" fill="#f5c000" text-anchor="middle">${safeTitle}</text>
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

const SEED_POST_SPECS: PostSeedDefinition[] = [
  {
    slug: "road-resurfacing-pothole-repair-drive",
    categoryCode: "pothole",
    color: "#f5c000",
    iconSymbol: "ROADS",
    tags: ["roads", "infrastructure", "traffic"],
    daysAgo: 2,
    title: {
      en: "Major Arterial Road Resurfacing & Pothole Repair Campaign",
      hi: "प्रमुख सड़कों का जीर्णोद्धार एवं गड्ढा मुक्ति अभियान",
      pa: "ਮੁੱਖ ਸੜਕਾਂ ਦੀ ਮੁਰੰਮਤ ਅਤੇ ਟੋਏ ਭਰਨ ਦੀ ਮੁਹਿੰਮ",
    },
    summary: {
      en: "Municipal engineering teams have deployed hot-mix asphalt pavers across primary transit corridors to repair post-monsoon surface damage.",
      hi: "नगर निगम की इंजीनियरिंग टीमों ने मानसून के बाद सड़कों की सतह को सुधारने के लिए हॉट-मिक्स डामर बिछाने का काम शुरू किया है।",
      pa: "ਨਗਰ ਨਿਗਮ ਦੀਆਂ ਇੰਜੀਨੀਅਰਿੰਗ ਟੀਮਾਂ ਨੇ ਮੁੱਖ ਆਵਾਜਾਈ ਵਾਲੀਆਂ ਸੜਕਾਂ ਦੀ ਮੁਰੰਮਤ ਲਈ ਕੰਮ ਸ਼ੁਰੂ ਕੀਤਾ ਹੈ।",
    },
    generateBlocks: (mediaId, issuePublicId) => ({
      en: [
        {
          type: "heading",
          level: 2,
          text: "Night-Shift Resurfacing Operations Across High-Density Corridors",
        },
        {
          type: "paragraph",
          text: "To avoid peak daytime congestion, mechanical milling and bituminous overlay works will run nightly between 10:00 PM and 5:30 AM. Over 14 kilometers of worn pavement are scheduled for full resurfacing this month.",
        },
        {
          type: "callout",
          variant: "warning",
          title: "Traffic Advisory",
          text: "One lane will remain closed on the Station Road corridor during night hours. Motorists are advised to follow directional milestone boards.",
        },
        {
          type: "image",
          mediaId,
          alt: "Heavy asphalt paver laying fresh bituminous layer on city roadway",
          caption: "Contractor teams applying 40mm dense bituminous macadam overlay.",
        },
        {
          type: "heading",
          level: 3,
          text: "Rigid Quality Standards & Citizen Tracking",
        },
        {
          type: "list",
          ordered: false,
          items: [
            "Compaction verified with dual-drum vibratory rollers meeting IRC specifications.",
            "Laser-straight lane markings with retro-reflective thermoplastic paint.",
            "Drainage slopes calibrated to prevent water stagnation along road kerbs.",
          ],
        },
        ...(issuePublicId
          ? [
              {
                type: "issueLink" as const,
                publicId: issuePublicId,
              },
            ]
          : []),
        {
          type: "divider",
        },
        {
          type: "quote",
          text: "Quality and durability are non-negotiable. Every road batch is laboratory tested for temperature and bitumen binder content.",
          citation: "Chief Municipal Engineer, Works Division",
        },
      ],
    }),
  },
  {
    slug: "ward-7-water-pipeline-maintenance",
    categoryCode: "water_leakage",
    color: "#0284c7",
    iconSymbol: "WATER",
    tags: ["water", "advisory", "utilities"],
    daysAgo: 4,
    title: {
      en: "Ward 7 Main Bulk Water Feeder Pipeline Maintenance Schedule",
      hi: "वार्ड 7 में मुख्य जल आपूर्ति पाइपलाइन का रखरखाव",
      pa: "ਵਾਰਡ 7 ਵਿੱਚ ਪਾਣੀ ਦੀ ਮੁੱਖ ਪਾਈਪਲਾਈਨ ਦੀ ਮੁਰੰਮਤ ਦਾ ਸਮਾਂ-ਸੂਚੀ",
    },
    summary: {
      en: "Replacement of a 450mm gate valve and interconnection with the newly constructed overhead balancing reservoir.",
      hi: "450 मिमी गेट वाल्व का प्रतिस्थापन और नए ओवरहेड जलाशय से कनेक्शन का कार्य।",
      pa: "ਨਵੇਂ ਬਣਾਏ ਗਏ ਪਾਣੀ ਦੇ ਭੰਡਾਰ ਨਾਲ ਕੁਨੈਕਸ਼ਨ ਅਤੇ ਵਾਲਵ ਬਦਲਣ ਦਾ ਕੰਮ।",
    },
    generateBlocks: (mediaId) => ({
      en: [
        {
          type: "heading",
          level: 2,
          text: "Planned Utility Shutdown for Reliability Upgrades",
        },
        {
          type: "paragraph",
          text: "The Water and Sanitation Directorate will execute planned replacement of aging cast-iron gate valves in Ward 7. The upgraded feeder will stabilize water pressure for over 22,000 households.",
        },
        {
          type: "callout",
          variant: "warning",
          title: "Scheduled Supply Interruption",
          text: "Water supply will remain suspended from Saturday 8:00 AM to Sunday 2:00 PM. Normal pressurized supply will resume Sunday evening.",
        },
        {
          type: "image",
          mediaId,
          alt: "Municipal water pipeline valve assembly and heavy distribution junction",
          caption: "Precision welding and alignment of high-pressure distribution valve.",
        },
        {
          type: "heading",
          level: 3,
          text: "Contingency Tanker Deployment",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "18 dedicated water tankers stationed at ward community hubs.",
            "Priority supply routed to hospitals and primary health centers.",
            "Citizens can request emergency water delivery via the CivicPulse helpline.",
          ],
        },
        {
          type: "divider",
        },
      ],
    }),
  },
  {
    slug: "solid-waste-segregation-drive",
    categoryCode: "garbage",
    color: "#16a34a",
    iconSymbol: "WASTE",
    tags: ["sanitation", "cleanliness", "environment"],
    daysAgo: 6,
    title: {
      en: "Mandatory Source Segregation: Green, Blue and Red Bins Enforced",
      hi: "कचरे का स्रोत पर अनिवार्य पृथक्करण: हरित, नीला और लाल डिब्बा",
      pa: "ਕੂੜੇ ਦਾ ਵੱਖਰਾ ਪ੍ਰਬੰਧਨ: ਹਰੇ, ਨੀਲੇ ਅਤੇ ਲਾਲ ਡੱਬੇ ਲਾਜ਼ਮੀ",
    },
    summary: {
      en: "Beginning next Monday, sanitation crews will accept waste only if segregated into organic, recyclable, and domestic sanitary categories.",
      hi: "आगामी सोमवार से केवल गीला और सूखा कचरा अलग-अलग होने पर ही स्वीकार किया जाएगा।",
      pa: "ਅਗਲੇ ਸੋਮਵਾਰ ਤੋਂ ਵੱਖ-ਵੱਖ ਕੀਤਾ ਕੂੜਾ ਹੀ ਨਗਰ ਨਿਗਮ ਦੀਆਂ ਗੱਡੀਆਂ ਵੱਲੋਂ ਚੁੱਕਿਆ ਜਾਵੇਗਾ।",
    },
    generateBlocks: (mediaId) => ({
      en: [
        {
          type: "heading",
          level: 2,
          text: "Zero-Landfill Initiative at Source",
        },
        {
          type: "paragraph",
          text: "Mixed municipal solid waste creates unmanageable landfill overburden and leachate hazards. To comply with national SWM guidelines, door-to-door tipper trucks will check segregation compliance before acceptance.",
        },
        {
          type: "image",
          mediaId,
          alt: "Color coded waste bins for source segregation and clean city drive",
          caption:
            "Green for wet compostable waste, Blue for dry recyclables, Red for hazardous waste.",
        },
        {
          type: "list",
          ordered: false,
          items: [
            "Green Bin: Fruit peels, cooked food, vegetable scraps, tea leaves, garden cuttings.",
            "Blue Bin: Paper, clean plastic cartons, metal cans, milk pouches, glass containers.",
            "Hazardous Bag: Expired medicines, sanitary pads, diapers, paint cans, batteries.",
          ],
        },
        {
          type: "quote",
          text: "A pristine city does not begin at the processing plant; it begins at our own kitchen doors.",
          citation: "Director of Municipal Solid Waste Management",
        },
      ],
    }),
  },
  {
    slug: "smart-led-streetlighting-replacement",
    categoryCode: "streetlight",
    color: "#eab308",
    iconSymbol: "LIGHTS",
    tags: ["electrical", "lighting", "energy"],
    daysAgo: 9,
    title: {
      en: "10,000 Smart LED Streetlights Deployed Across Municipal Wards",
      hi: "नगर निगम के वार्डों में 10,000 स्मार्ट एलईडी स्ट्रीटलाइट्स स्थापित",
      pa: "ਨਗਰ ਨਿਗਮ ਵਾਰਡਾਂ ਵਿੱਚ 10,000 ਸਮਾਰਟ ਐਲਈਡੀ ਸਟ੍ਰੀਟ ਲਾਈਟਾਂ ਚਾਲੂ",
    },
    summary: {
      en: "Centralized telemetry automatically flags dark spots, reduces power grid load by 48%, and restores broken lamps under SLA.",
      hi: "स्वचालित टेलीमेट्री से बिजली की खपत में 48% की बचत और 24 घंटे में मरम्मत।",
      pa: "ਬਿਜਲੀ ਦੀ ਖਪਤ ਵਿੱਚ 48% ਦੀ ਬੱਚਤ ਅਤੇ ਖਰਾਬ ਲਾਈਟਾਂ ਦੀ ਤੁਰੰਤ ਮੁਰੰਮਤ।",
    },
    generateBlocks: (mediaId) => ({
      en: [
        {
          type: "heading",
          level: 2,
          text: "Automated Centralized Lighting Management System",
        },
        {
          type: "paragraph",
          text: "The electrical works wing has completed the phased retrofitting of high-pressure sodium fixtures with high-lumens smart LEDs. Each lighting node reports current draw, voltage, and burnt-out bulb alerts in real time.",
        },
        {
          type: "callout",
          variant: "info",
          title: "Safety Enhancement",
          text: "Night-time pedestrian lux levels have improved by over 260%, specifically covering school routes, bus depots, and railway approach roads.",
        },
        {
          type: "image",
          mediaId,
          alt: "Illuminated public roadway with bright smart LED streetlighting overhead",
          caption: "Consistent 35-lux illumination on arterial road sectors.",
        },
        {
          type: "divider",
        },
      ],
    }),
  },
  {
    slug: "monsoon-drainage-desilting-campaign",
    categoryCode: "drainage",
    color: "#0d9488",
    iconSymbol: "DRAINS",
    tags: ["drainage", "monsoon", "safety"],
    daysAgo: 12,
    title: {
      en: "Intensive Pre-Monsoon Nallah Desilting & Culvert Dredging",
      hi: "मानसून पूर्व नालों की सफाई और गाद निकासी का सघन अभियान",
      pa: "ਬਰਸਾਤਾਂ ਤੋਂ ਪਹਿਲਾਂ ਨਾਲਿਆਂ ਦੀ ਡੂੰਘੀ ਸਫਾਈ ਅਤੇ ਗਾਰ ਕੱਢਣ ਦੀ ਮੁਹਿੰਮ",
    },
    summary: {
      en: "Mechanical excavators and high-suction super suckers clear 80,000 metric tonnes of silt from major natural storm drainage channels.",
      hi: "जलभराव रोकने के लिए 80,000 मीट्रिक टन गाद और मलबे को नालों से बाहर निकाला गया।",
      pa: "ਬਰਸਾਤੀ ਪਾਣੀ ਦੀ ਨਿਕਾਸੀ ਯਕੀਨੀ ਬਣਾਉਣ ਲਈ ਵੱਡੇ ਪੱਧਰ 'ਤੇ ਨਾਲਿਆਂ ਦੀ ਸਫਾਈ।",
    },
    generateBlocks: (mediaId) => ({
      en: [
        {
          type: "heading",
          level: 2,
          text: "Preventing Waterlogging Across Critical Underpasses",
        },
        {
          type: "paragraph",
          text: "Storm water drainage channels are undergoing round-the-clock desilting to ensure smooth runoff during torrential rainfall. All railway underpasses and subway approaches have been equipped with automated sump pumping units.",
        },
        {
          type: "image",
          mediaId,
          alt: "Mechanical excavator dredging silt from storm water nallah channel",
          caption: "Heavy excavator removing debris from central trunk drainage canal.",
        },
        {
          type: "list",
          ordered: false,
          items: [
            "24x7 Flood Control Room operational with emergency response squads.",
            "CCTV cameras installed at vulnerable waterlogging choke points.",
            "High-capacity diesel dewatering pumps positioned at standby junctions.",
          ],
        },
      ],
    }),
  },
  {
    slug: "citizens-grievance-redressal-counters",
    categoryCode: "road_damage",
    color: "#d97706",
    iconSymbol: "CIVIC",
    tags: ["governance", "citizen-services", "notice"],
    daysAgo: 15,
    title: {
      en: "Walk-in Assisted Grievance Redressal Desks Live in All Zonal Offices",
      hi: "सभी जोनल कार्यालयों में नागरिक सहायता शिकायत निवारण केंद्र शुरू",
      pa: "ਸਾਰੇ ਜ਼ੋਨਲ ਦਫ਼ਤਰਾਂ ਵਿੱਚ ਨਾਗਰਿਕ ਸਹਾਇਤਾ ਡੈਸਕ ਸ਼ੁਰੂ",
    },
    summary: {
      en: "To bridge digital divides, citizens can now register municipal issues with trained desk officers who upload complaints directly into CivicPulse.",
      hi: "डिजिटल दूरी को समाप्त करने के लिए जोनल कार्यालयों में वॉक-इन सहायता केंद्र शुरू किए गए हैं।",
      pa: "ਨਾਗਰਿਕਾਂ ਦੀ ਸਹੂਲਤ ਲਈ ਦਫ਼ਤਰਾਂ ਵਿੱਚ ਸਿੱਧੀ ਸ਼ਿਕਾਇਤ ਦਰਜ ਕਰਵਾਉਣ ਲਈ ਡੈਸਕ ਸਥਾਪਿਤ।",
    },
    generateBlocks: (mediaId) => ({
      en: [
        {
          type: "heading",
          level: 2,
          text: "Accessible Civic Infrastructure for All Citizens",
        },
        {
          type: "paragraph",
          text: "While the CivicPulse web app and WhatsApp bots provide immediate reporting, walk-in facilitation counters ensure elderly and non-smartphone citizens receive the same rapid SLA resolution.",
        },
        {
          type: "callout",
          variant: "info",
          title: "Operating Hours",
          text: "Counters operate Monday through Saturday from 9:30 AM to 5:00 PM. An instant SMS token with real-time tracking is provided upon filing.",
        },
        {
          type: "image",
          mediaId,
          alt: "Municipal civic center citizen service counter with assistance desk officer",
          caption:
            "Citizens filing and tracking local ward issues at Zonal Headquarters Counter 3.",
        },
        {
          type: "quote",
          text: "Public administration must meet the citizen where they are, whether on a smartphone or in person.",
          citation: "Municipal Commissioner",
        },
      ],
    }),
  },
];

export async function seedPostsForTenants(): Promise<void> {
  await connectMongo();
  const platformDb = new PlatformDb();
  const tenants = await platformDb.listTenants();

  for (const tenant of tenants) {
    console.log(`Seeding 6 civic update posts for tenant: ${tenant.name} (${tenant.id})...`);
    const tenantDb = new TenantDb(tenant.id);
    const adminUser =
      (await tenantDb.findUserByIdentifier(`admin@${tenant.slug.replace("demo-", "")}.local`)) ||
      (await tenantDb.findUserByIdentifier("admin@punjab.local"));
    const authorId = adminUser ? adminUser.id : "system-seed-admin";

    // Find any existing sample issue to link in the first post
    const sampleIssue = await Issue.findOne({ tenantId: tenant.id }).exec();
    const issuePublicId = sampleIssue?.publicId;

    for (const spec of SEED_POST_SPECS) {
      // Check if post already exists
      const existing = await Post.findOne({ tenantId: tenant.id, slug: spec.slug }).exec();
      if (existing) {
        continue;
      }

      // Generate realistic image via sharp
      const imageBuffer = await generateSeedImage(
        spec.title["en"] || spec.slug,
        spec.color,
        spec.iconSymbol
      );
      const media = await processAndStoreMedia(
        imageBuffer,
        tenant.id,
        authorId,
        spec.title["en"] || spec.slug,
        `Official dispatch visual for ${spec.title["en"]}`
      );

      const publishedAt = new Date(Date.now() - spec.daysAgo * 86400000);
      const blocksMap = spec.generateBlocks(media.id, issuePublicId);

      await Post.create({
        tenantId: tenant.id,
        authorId,
        slug: spec.slug,
        status: "published",
        coverMediaId: media.id,
        title: spec.title,
        summary: spec.summary,
        blocks: blocksMap,
        tags: spec.tags,
        publishedAt,
        version: 1,
        commentsEnabled: true,
        commentCount: 0,
      });
    }
  }

  console.log("Successfully seeded 6 posts per demo tenant with Sharp images.");
}
