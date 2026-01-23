import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002;

// --- VOTRE CLÉ API ---
const RIOT_API_KEY = "RGAPI-xxx-xxx-xxx-xxx-xxx"; 

app.use(cors());
app.use(express.static(path.join(__dirname, 'dist')));

// --- ROUTAGE ---
const getRoutingValue = (region) => {
    const map = {
        'EUW': 'euw1', 'EUNE': 'eun1',
        'NA': 'na1', 'BR': 'br1', 'LAN': 'la1', 'LAS': 'la2',
        'KR': 'kr', 'JP': 'jp1', 'OCE': 'oc1',
        'TR': 'tr1', 'RU': 'ru', 'PH': 'ph2', 'SG': 'sg2', 'TH': 'th2', 'TW': 'tw2', 'VN': 'vn2'
    };
    return map[region.toUpperCase()] || 'euw1';
};

const getClusterValue = (region) => {
    if(['NA', 'BR', 'LAN', 'LAS'].includes(region)) return 'americas';
    if(['KR', 'JP'].includes(region)) return 'asia';
    if(['PH', 'SG', 'TH', 'TW', 'VN'].includes(region)) return 'sea';
    return 'europe';
};

// --- NOUVEAU GET RANK (VIA PUUID DIRECTEMENT) ---
const getRank = async (puuid, region) => {
    const route = getRoutingValue(region);
    
    // URL utilisant DIRECTEMENT le PUUID (Autorisé par votre clé)
    const url = `https://${route}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;

    try {
        const res = await axios.get(url, { headers: { "X-Riot-Token": RIOT_API_KEY } });
        
        // On cherche la SoloQ
        const soloQ = res.data.find(l => l.queueType === 'RANKED_SOLO_5x5');
        
        if (soloQ) {
            console.log(`[DEBUG] Rank trouvé pour ${puuid.substring(0,5)}... : ${soloQ.tier} ${soloQ.rank}`);
            return { tier: soloQ.tier, rank: soloQ.rank };
        }
        return { tier: 'UNRANKED', rank: '' };

    } catch (e) {
        console.error(`[ERROR] Echec Rank sur ${route}: ${e.response?.status} - ${e.response?.statusText}`);
        return { tier: 'UNRANKED', rank: '' };
    }
};

// --- HELPERS MATCHS ---
const findDuoData = (myPart, participants) => {
    const myRole = myPart.teamPosition; 
    let targetRole = 'JUNGLE'; 
    if (myRole === 'UTILITY') targetRole = 'BOTTOM';
    if (myRole === 'BOTTOM') targetRole = 'UTILITY';
    if (myRole === 'JUNGLE') targetRole = 'MIDDLE';
    if (myRole === 'MIDDLE') targetRole = 'JUNGLE';
    if (myRole === 'TOP') targetRole = 'JUNGLE';

    const duo = participants.find(p => p.teamId === myPart.teamId && p.teamPosition === targetRole && p.puuid !== myPart.puuid);
    return duo ? { champion: duo.championName, role: duo.teamPosition } : null;
};

const findOpponentPart = (role, myTeamId, participants) => {
    if (!role) return null;
    return participants.find(p => p.teamId !== myTeamId && p.teamPosition === role);
};

// --- API ENDPOINTS ---
app.get('/api/versions', async (req, res) => {
    try {
        const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
        res.json(response.data);
    } catch (error) { res.json(['14.1.1']); }
});

app.get('/api/image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('URL manquante');
    try {
        const response = await axios.get(imageUrl, { 
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const contentType = imageUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
        res.set('Content-Type', contentType);
        res.send(response.data);
    } catch (error) { res.status(404).send('Image introuvable'); }
});

app.get('/api/riot/:gameName/:tagLine/:region', async (req, res) => {
    const { gameName, tagLine, region } = req.params;
    const cluster = getClusterValue(region);
    
    console.log(`\n=== RECHERCHE: ${gameName}#${tagLine} ===`);

    try {
        // 1. Account (PUUID)
        const accUrl = `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
        const accRes = await axios.get(accUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });
        const puuid = accRes.data.puuid;

        // 2. MON RANG (Appel unique optimisé)
        const myRankData = await getRank(puuid, region);

        // 3. MATCH HISTORY
        const matUrl = `https://${cluster}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`;
        const matRes = await axios.get(matUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });
        
        // 4. DETAILS DES MATCHS
        const details = await Promise.all(matRes.data.map(id => 
            axios.get(`https://${cluster}.api.riotgames.com/lol/match/v5/matches/${id}`, { headers: { "X-Riot-Token": RIOT_API_KEY } }).catch(e=>null)
        ));

        const formatted = await Promise.all(details.filter(r => r && r.data).map(async (r, idx) => {
            const info = r.data.info;
            const p = info.participants.find(part => part.puuid === puuid);
            if (!p) return null;

            const csMin = (info.gameDuration / 60 > 0) ? ((p.totalMinionsKilled + p.neutralMinionsKilled) / (info.gameDuration / 60)).toFixed(1) : "0.0";
            
            const duoData = findDuoData(p, info.participants);
            const oppPart = findOpponentPart(p.teamPosition, p.teamId, info.participants);
            const oppDuoPart = duoData ? findOpponentPart(duoData.role, p.teamId, info.participants) : null;

            // 5. RANG ADVERSAIRE
            // On limite les appels pour ne pas surcharger la clé (Ex: seulement le premier match a le rang auto, ou avec un délai)
            let oppRankData = { tier: 'UNRANKED', rank: '' };
            if (oppPart) {
                // Petit délai pour la sécurité (Rate Limit)
                await new Promise(r => setTimeout(r, 100 * idx)); 
                oppRankData = await getRank(oppPart.puuid, region);
            }

            return {
                id: info.gameId,
                champion: p.championName,
                role: p.teamPosition,
                kills: p.kills, deaths: p.deaths, assists: p.assists,
                win: p.win,
                csMin: csMin,
                
                myRankTier: myRankData.tier,
                myRankDiv: myRankData.rank,
                
                oppRankTier: oppRankData.tier,
                oppRankDiv: oppRankData.rank,

                duoChampion: duoData ? duoData.champion : null,
                duoRole: duoData ? duoData.role : null,
                oppChampion: oppPart ? oppPart.championName : null,
                oppRole: oppPart ? oppPart.teamPosition : null,
                oppDuoChampion: oppDuoPart ? oppDuoPart.championName : null,
                oppDuoRole: oppDuoPart ? oppDuoPart.teamPosition : null
            };
        }));

        res.json({ matches: formatted.filter(m => m !== null) });

    } catch (error) {
        console.error("❌ ERREUR:", error.response?.data || error.message);
        res.status(500).json({ error: "Erreur API Riot" });
    }
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'dist', 'index.html')); });
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Serveur prêt sur ${PORT}`));
