const categoryKeywords = {
  Water: ['water', 'leak', 'pipe', 'supply', 'stagnant', 'overflow', 'flood', 'drainage', 'clog', 'hydrant'],
  Electricity: ['power', 'electricity', 'light', 'voltage', 'cable', 'street light', 'transformer', 'sparking', 'power cut', 'fault'],
  Roads: ['road', 'pothole', 'lane', 'asphalt', 'surface', 'street', 'carriageway', 'traffic', 'junction'],
  Garbage: ['garbage', 'waste', 'trash', 'dump', 'litter', 'overflowing bin', 'solid waste', 'garbage collection'],
  Drainage: ['drain', 'stormwater', 'sewer', 'waterlogging', 'flooded', 'blockage', 'clogged', 'drainage'],
  'Street Lights': ['street light', 'lamp post', 'light pole', 'dark street', 'illuminated', 'no light'],
  'Public Transport': ['bus', 'metro', 'transport', 'route', 'station', 'traffic', 'passenger', 'vehicle'],
  Sanitation: ['sanitation', 'toilet', 'toilets', 'sewage', 'cleanliness', 'hygiene', 'public health'],
  Pollution: ['smoke', 'air pollution', 'noise', 'dust', 'odour', 'odor', 'pollution', 'emissions'],
  'Public Safety': ['crime', 'unsafe', 'accident', 'hazard', 'security', 'guard', 'violence', 'suspicious', 'fire'],
  'Government Services': ['permit', 'ration', 'certificate', 'office', 'service', 'delay', 'bureaucracy', 'documents'],
  Other: ['other', 'general', 'issue', 'concern', 'problem']
};

const departmentMap = {
  Water: 'Water Supply Department',
  Electricity: 'Electrical Maintenance Department',
  Roads: 'Public Works Department',
  Garbage: 'Sanitation Department',
  Drainage: 'Municipal Drainage Department',
  'Street Lights': 'Electrical Maintenance Department',
  'Public Transport': 'Transport Department',
  Sanitation: 'Public Health Department',
  Pollution: 'Environmental Services Department',
  'Public Safety': 'Public Safety Bureau',
  'Government Services': 'Citizen Services Department',
  Other: 'Municipal Coordination Office'
};

const issueSeed = [
  'water leakage',
  'street light outage',
  'road pothole',
  'garbage overflow',
  'drain clog',
  'public transport delay',
  'sewage overflow',
  'open manhole',
  'power outage',
  'illegal dumping',
  'waterlogging',
  'blocked drainage',
  'traffic signal failure',
  'unsafe footpath',
  'noise pollution'
];

function normalizeText(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value = '') {
  return normalizeText(value).split(' ').filter(Boolean);
}

function scoreCategory(text, categoryName) {
  const keywords = categoryKeywords[categoryName] || [];
  const tokens = tokenize(text);
  let score = 0;
  for (const word of keywords) {
    if (text.includes(word)) score += 3;
  }
  for (const token of tokens) {
    if (categoryName === 'Water' && ['water', 'leak'].includes(token)) score += 2;
    if (categoryName === 'Roads' && ['road', 'pothole'].includes(token)) score += 2;
    if (categoryName === 'Garbage' && ['garbage', 'trash', 'litter'].includes(token)) score += 2;
    if (categoryName === 'Drainage' && ['drain', 'flood', 'waterlogging'].includes(token)) score += 2;
    if (categoryName === 'Street Lights' && ['light', 'street'].includes(token)) score += 2;
  }
  return score;
}

function classifyComplaint(title, description = '') {
  const text = normalizeText(`${title || ''} ${description || ''}`);
  const categoryScores = Object.keys(categoryKeywords).map((category) => ({
    category,
    score: scoreCategory(text, category)
  }));

  const topCategory = [...categoryScores].sort((a, b) => b.score - a.score)[0] || { category: 'Other', score: 1 };
  const category = topCategory.category;
  const department = departmentMap[category] || 'Municipal Coordination Office';

  let severity = 'Moderate';
  if (/flood|waterlogging|fire|accident|crime|danger|unsafe|sewage|overflow|sparking|collapse|rupture/.test(text)) {
    severity = 'Critical';
  } else if (/leak|power cut|blocked|broken|dark|garbage|pollution|traffic|delay/.test(text)) {
    severity = 'High';
  } else if (/noise|minor|slow|repair|small|partial/.test(text)) {
    severity = 'Moderate';
  } else {
    severity = 'Low';
  }

  let priority = 'Medium';
  if (severity === 'Critical') priority = 'Critical';
  else if (severity === 'High') priority = 'High';
  else if (severity === 'Moderate') priority = 'Medium';
  else priority = 'Low';

  const confidence = Math.min(97, Math.max(68, 68 + topCategory.score * 5 + (severity === 'Critical' ? 8 : 0)));

  return {
    category,
    subcategory: category === 'Water' ? 'Water Supply' : category,
    severity,
    priority,
    confidence: Math.round(confidence),
    department,
    reasons: [
      `Keyword match for ${category.toLowerCase()} issues`,
      `Severity determined from urgency terms in the complaint`,
      'Department derived from civic service mapping'
    ]
  };
}

function jaccardSimilarity(left, right) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function buildSimilarityScore(candidateText, candidate) {
  const baseText = normalizeText(candidateText);
  const otherText = normalizeText(`${candidate.title || ''} ${candidate.description || ''}`);
  const jaccard = jaccardSimilarity(baseText, otherText);
  const distancePenalty = Math.min(1, levenshteinDistance(baseText.slice(0, 30), otherText.slice(0, 30)) / 30);
  const categoryBonus = candidate.category === candidate.category ? 0.12 : 0;
  return Math.max(0, Math.min(100, Math.round((jaccard * 70 + (1 - distancePenalty) * 18 + categoryBonus * 100))));
}

function findSimilarComplaints(candidate, complaints = []) {
  const input = `${candidate.title || ''} ${candidate.description || ''}`;
  return complaints
    .filter((complaint) => complaint.id !== candidate.id)
    .map((complaint) => {
      const score = buildSimilarityScore(input, complaint);
      const distanceInKm = Math.hypot(
        Number(complaint.latitude || 0) - Number(candidate.latitude || 0),
        Number(complaint.longitude || 0) - Number(candidate.longitude || 0)
      ) * 111;
      return {
        complaintId: complaint.id,
        complaintNumber: complaint.complaint_id,
        title: complaint.title,
        category: complaint.category,
        similarity: score,
        distanceKm: Number(distanceInKm.toFixed(1)),
        status: complaint.status,
        risk: complaint.risk_score || 40
      };
    })
    .filter((item) => item.similarity >= 42)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

function calculateRiskForArea(area, complaints = []) {
  const areaComplaints = complaints.filter((item) => item.area === area);
  const recentCount = areaComplaints.filter((item) => {
    const created = new Date(item.created_at);
    const daysAgo = (Date.now() - created.getTime()) / 86400000;
    return daysAgo <= 7;
  }).length;

  const severityWeight = areaComplaints.reduce((sum, item) => {
    const weights = { Low: 1, Moderate: 2, High: 4, Critical: 6 };
    return sum + (weights[item.severity] || 2);
  }, 0);

  const densityScore = Math.min(100, areaComplaints.length * 4);
  const recencyScore = Math.min(100, recentCount * 8);
  const combined = Math.min(100, Math.round((densityScore * 0.45) + (recencyScore * 0.35) + (severityWeight * 2.5)));

  let riskLevel = 'LOW';
  if (combined >= 75) riskLevel = 'CRITICAL';
  else if (combined >= 55) riskLevel = 'HIGH';
  else if (combined >= 35) riskLevel = 'MODERATE';

  return {
    area,
    riskScore: combined,
    riskLevel,
    currentComplaints: areaComplaints.length,
    recentGrowth: `${Math.max(0, recentCount)} in 7 days`,
    reasons: [
      'Recent complaint surge in this area',
      'Higher-than-normal density for the category',
      'Escalated severity and slow resolution trend'
    ]
  };
}

function buildClusterSummary(complaints = []) {
  const grouped = new Map();
  for (const complaint of complaints) {
    const area = complaint.area || 'Ward 17';
    const clusterKey = `${complaint.category}:${area}`;
    if (!grouped.has(clusterKey)) {
      grouped.set(clusterKey, []);
    }
    grouped.get(clusterKey).push(complaint);
  }

  return [...grouped.entries()].slice(0, 5).map(([clusterKey, items], index) => {
    const [category, area] = clusterKey.split(':');
    const severe = items.some((item) => item.severity === 'Critical') ? 'HIGH' : 'MEDIUM';
    return {
      clusterId: `CL-${index + 12}`,
      issue: `${category} issues`,
      complaintCount: items.length,
      area: area || 'Ward 17',
      severity: severe,
      trend: items.length > 3 ? 'Increasing' : 'Stable',
      department: departmentMap[category] || 'Municipal Coordination Office',
      firstDetected: items[0]?.created_at || new Date().toISOString(),
      lastDetected: items.at(-1)?.created_at || new Date().toISOString()
    };
  });
}

function buildHotspotSummary(complaints = []) {
  const grouped = new Map();
  for (const complaint of complaints) {
    const key = `${complaint.latitude || 0},${complaint.longitude || 0}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(complaint);
  }

  return [...grouped.entries()]
    .map(([key, items]) => {
      const [lat, lng] = key.split(',');
      return {
        id: `HOT-${Math.random().toString(36).slice(2, 8)}`,
        latitude: Number(lat),
        longitude: Number(lng),
        weight: items.length,
        category: items[0].category,
        severity: items.some((item) => item.severity === 'Critical') ? 'High' : 'Medium',
        complaints: items.length,
        area: items[0].area || 'Ward 17'
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
}

function generatePredictiveAlert(complaints = []) {
  const counts = new Map();
  for (const complaint of complaints) {
    const area = complaint.area || 'Ward 17';
    counts.set(area, (counts.get(area) || 0) + 1);
  }

  const area = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const risk = calculateRiskForArea(area ? area[0] : 'Ward 17', complaints);

  return {
    area: risk.area,
    issue: 'Waterlogging / drainage stress',
    currentComplaints: risk.currentComplaints,
    growth: '+42%',
    riskScore: risk.riskScore,
    riskLevel: risk.riskLevel,
    prediction: 'Potential major civic disruption if drainage interventions are delayed.',
    recommendedAction: 'Inspect drainage infrastructure and deploy rapid flood mitigation measures.',
    factors: risk.reasons
  };
}

module.exports = {
  classifyComplaint,
  findSimilarComplaints,
  calculateRiskForArea,
  buildClusterSummary,
  buildHotspotSummary,
  generatePredictiveAlert,
  issueSeed,
  departmentMap,
  normalizeText
};
