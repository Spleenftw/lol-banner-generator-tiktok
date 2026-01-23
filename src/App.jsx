import React, { useState, useRef, useEffect } from 'react';
import { Download, Search, Loader2, AlertCircle, X } from 'lucide-react';

export default function KDAOverlayGenerator() {
  const bannerRef = useRef(null);
  const [ddragonVersion, setDdragonVersion] = useState('14.1.1');
  
  // --- ÉTATS INPUTS ---
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [region, setRegion] = useState('EUW');
  
  // --- HISTORIQUE ---
  const [recentSearches, setRecentSearches] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // --- DONNÉES MANUELLES ---
  const [manualData, setManualData] = useState({
    champion: 'Jinx', role: 'BOTTOM',
    kills: '13', deaths: '8', assists: '7', kda: '2.5', csMin: '8.5',
    rankTier: 'UNRANKED', rankDiv: 'IV',
    oppRankTier: 'UNRANKED', oppRankDiv: 'I',
    teammate: 'Thresh', teammateRole: 'UTILITY',
    oppChampion: 'Caitlyn', oppRole: 'BOTTOM',
    oppTeammate: 'Lux', oppTeammateRole: 'UTILITY',
    victory: true
  });

  useEffect(() => {
    fetch('/api/versions').then(r => r.json()).then(v => { if(v?.length) setDdragonVersion(v[0]); }).catch(console.error);
    const savedHistory = localStorage.getItem('lol_kda_history');
    if (savedHistory) setRecentSearches(JSON.parse(savedHistory));
  }, []);

  // --- HELPERS ---
  const getChampionIcon = (name) => {
    if(!name) return '';
    let clean = name.replace(/['\s.]/g, '');
    if(clean === 'Wukong') clean = 'MonkeyKing';
    if(clean === 'RenataGlasc') clean = 'Renata';
    const riotUrl = `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${clean}.png`;
    return `/api/image?url=${encodeURIComponent(riotUrl)}`;
  };

  const getRoleIcon = (role) => {
    if (!role) return '';
    const map = { 'TOP':'TOP', 'JUNGLE':'JUNGLE', 'MIDDLE':'MIDDLE', 'MID':'MIDDLE', 'BOTTOM':'BOTTOM', 'UTILITY':'UTILITY', 'SUPPORT':'UTILITY' };
    const fileName = map[role] || 'UTILITY';
    return `/img/${fileName}.svg`;
  };

  const getRankIcon = (tier) => {
    if (!tier || tier === 'UNRANKED') return '';
    return `/img/emblem-${tier.toLowerCase()}.png`;
  };

  const calculateKDA = (k, d, a) => {
    const dNum = parseInt(d) || 0;
    if (dNum === 0) return 'Perfect';
    return ((parseInt(k) + parseInt(a)) / dNum).toFixed(1);
  };

  // --- LOGIQUE HISTORIQUE ---
  const saveToHistory = (name, tag) => {
    const newItem = { name, tag, region };
    const filtered = recentSearches.filter(item => !(item.name.toLowerCase() === name.toLowerCase() && item.tag.toLowerCase() === tag.toLowerCase()));
    const newHistory = [newItem, ...filtered].slice(0, 5);
    setRecentSearches(newHistory);
    localStorage.setItem('lol_kda_history', JSON.stringify(newHistory));
  };

  const loadFromHistory = (item) => {
    setGameName(item.name);
    setTagLine(item.tag);
    setShowHistory(false);
  };

  const deleteFromHistory = (e, index) => {
    e.stopPropagation();
    const newHistory = [...recentSearches];
    newHistory.splice(index, 1);
    setRecentSearches(newHistory);
    localStorage.setItem('lol_kda_history', JSON.stringify(newHistory));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') fetchMatches();
  };

  // --- API ---
  const fetchMatches = async () => {
    if (!gameName.trim() || !tagLine.trim()) return setError('Remplissez Nom et Tag');
    const cleanTag = tagLine.replace('#', '');

    setLoading(true); setError(''); setMatches([]); setShowHistory(false);
    
    try {
      const res = await fetch(`/api/riot/${encodeURIComponent(gameName)}/${encodeURIComponent(cleanTag)}/${region}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur inconnue');
      setMatches(data.matches.map((m, i) => ({ id: i, ...m, victory: m.win })));
      saveToHistory(gameName, cleanTag);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectMatch = (match) => {
    setManualData(prev => {
        const myTier = (match.myRankTier && match.myRankTier !== 'undefined') ? match.myRankTier : prev.rankTier;
        const myDiv = (match.myRankDiv && match.myRankDiv !== 'undefined') ? match.myRankDiv : prev.rankDiv;
        const oppTier = (match.oppRankTier && match.oppRankTier !== 'undefined') ? match.oppRankTier : prev.oppRankTier;
        const oppDiv = (match.oppRankDiv && match.oppRankDiv !== 'undefined') ? match.oppRankDiv : prev.oppRankDiv;

        return {
            ...prev,
            champion: match.champion, role: match.role,
            kills: match.kills, deaths: match.deaths, assists: match.assists,
            kda: calculateKDA(match.kills, match.deaths, match.assists),
            victory: match.victory,
            csMin: match.csMin,
            rankTier: myTier, rankDiv: myDiv,
            oppRankTier: oppTier, oppRankDiv: oppDiv,
            teammate: match.duoChampion, teammateRole: match.duoRole,
            oppChampion: match.oppChampion, oppRole: match.oppRole,
            oppTeammate: match.oppDuoChampion, oppTeammateRole: match.oppDuoRole
        };
    });
  };

  const handleManualChange = (field, value) => {
    setManualData(prev => {
        const updated = { ...prev, [field]: value };
        if (['kills','deaths','assists'].includes(field)) {
            updated.kda = calculateKDA(
                field === 'kills' ? value : prev.kills,
                field === 'deaths' ? value : prev.deaths,
                field === 'assists' ? value : prev.assists
            );
        }
        return updated;
    });
  };

  // --- DESSIN PNG ---
  const downloadBanner = async () => {
    if (!bannerRef.current) return;
    setIsGenerating(true);

    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const height = 170;
        const exportWidth = 700;
        
        canvas.width = exportWidth * 2; canvas.height = height * 2;
        ctx.scale(2, 2);

        // Fond
        const gradient = ctx.createLinearGradient(0, 0, exportWidth, 0);
        if (manualData.victory) { gradient.addColorStop(0, '#312e81'); gradient.addColorStop(1, '#1e3a8a'); } 
        else { gradient.addColorStop(0, '#7f1d1d'); gradient.addColorStop(1, '#881337'); }
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, exportWidth, height);
        ctx.fillStyle = manualData.victory ? '#5383E8' : '#E84057'; ctx.fillRect(0, 0, 8, height);

        const loadImage = (src) => new Promise((resolve) => {
            if(!src) return resolve(null);
            const img = new Image(); img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src;
        });

        // Fonction Dessin RANG
        const drawRankBadge = async (tier, div, x, y, align) => {
            if (!tier || tier === 'UNRANKED') return;
            const rankImg = await loadImage(getRankIcon(tier));
            if (rankImg) {
                const size = 38;
                ctx.drawImage(rankImg, x, y, size, size);
                ctx.font = 'bold 15px Arial'; 
                ctx.fillStyle = '#C8AA6E';
                ctx.textAlign = align === 'left' ? 'left' : 'right';
                const textX = align === 'left' ? x + size + 8 : x - 8;
                const textY = y + 24; 
                ctx.fillText(`${tier} ${div}`, textX, textY);
            }
        };

        const drawCluster = async (champ, role, duo, duoRole, startX, isLeft, rTier, rDiv) => {
            const mSize = 75; const dSize = 55;
            if(duo) {
                const duoImg = await loadImage(getChampionIcon(duo));
                const duoRoleImg = await loadImage(getRoleIcon(duoRole));
                if(duoImg) {
                    const dX = isLeft ? startX + 45 : startX - 45 - dSize; 
                    const dY = 45; 
                    ctx.beginPath(); ctx.arc(dX + dSize/2, dY + dSize/2, dSize/2 + 2, 0, Math.PI * 2); 
                    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fill();
                    ctx.save(); ctx.beginPath(); ctx.arc(dX + dSize/2, dY + dSize/2, dSize/2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
                    ctx.drawImage(duoImg, dX, dY, dSize, dSize); ctx.restore();
                    ctx.strokeStyle = isLeft ? '#a78bfa' : '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(dX + dSize/2, dY + dSize/2, dSize/2, 0, Math.PI * 2); ctx.stroke();
                    if (duoRoleImg) {
                        const rSize = 20; const rX = isLeft ? dX + dSize - rSize + 5 : dX - 5; const rY = dY + dSize - rSize + 5;
                        ctx.fillStyle = "#1e1e1e"; ctx.fillRect(rX, rY, rSize, rSize);
                        ctx.strokeStyle = "#555"; ctx.lineWidth = 1; ctx.strokeRect(rX, rY, rSize, rSize);
                        ctx.drawImage(duoRoleImg, rX + 2, rY + 2, rSize - 4, rSize - 4);
                    }
                }
            }
            const myImg = await loadImage(getChampionIcon(champ));
            const myRoleImg = await loadImage(getRoleIcon(role));
            if(myImg) {
                const mX = isLeft ? startX : startX - mSize; 
                const mY = 47; 
                ctx.beginPath(); ctx.arc(mX + mSize/2, mY + mSize/2, mSize/2 + 3, 0, Math.PI * 2); ctx.fillStyle = "#1a1a1a"; ctx.fill();
                ctx.save(); ctx.beginPath(); ctx.arc(mX + mSize/2, mY + mSize/2, mSize/2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
                ctx.drawImage(myImg, mX, mY, mSize, mSize); ctx.restore();
                ctx.strokeStyle = isLeft ? '#C8AA6E' : '#dc2626'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mX + mSize/2, mY + mSize/2, mSize/2, 0, Math.PI * 2); ctx.stroke();
                if (myRoleImg) {
                    const rSize = 24; const rX = isLeft ? mX : mX + mSize - rSize; const rY = mY + mSize - rSize;
                    ctx.fillStyle = "#111"; ctx.fillRect(rX, rY, rSize, rSize);
                    ctx.strokeStyle = isLeft ? "#C8AA6E" : "#dc2626"; ctx.lineWidth = 1; ctx.strokeRect(rX, rY, rSize, rSize);
                    ctx.drawImage(myRoleImg, rX + 2, rY + 2, rSize - 4, rSize - 4);
                }

                const offset = 15; 
                if (isLeft) {
                    await drawRankBadge(rTier, rDiv, mX + 10 + offset, mY + mSize + 10, 'left');
                } else {
                    await drawRankBadge(rTier, rDiv, mX + mSize - 35 - 10 - offset, mY + mSize + 10, 'right');
                }
            }
        };

        await drawCluster(manualData.champion, manualData.role, manualData.teammate, manualData.teammateRole, 20, true, manualData.rankTier, manualData.rankDiv);
        await drawCluster(manualData.oppChampion, manualData.oppRole, manualData.oppTeammate, manualData.oppTeammateRole, exportWidth - 20, false, manualData.oppRankTier, manualData.oppRankDiv);

        const cx = exportWidth / 2; const cy = height / 2;
        ctx.textAlign = "center"; ctx.font = 'bold 36px Arial';
        const kdaY = cy - 8; 
        ctx.fillStyle = '#ffffff'; ctx.fillText(manualData.kills, cx - 70, kdaY);
        ctx.fillStyle = '#666'; ctx.font = '28px Arial'; ctx.fillText('/', cx - 35, kdaY);
        ctx.fillStyle = '#ff5859'; ctx.font = 'bold 36px Arial'; ctx.fillText(manualData.deaths, cx, kdaY);
        ctx.fillStyle = '#666'; ctx.font = '28px Arial'; ctx.fillText('/', cx + 35, kdaY);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px Arial'; ctx.fillText(manualData.assists, cx + 70, kdaY);
        
        const statsY = cy + 22;
        ctx.font = 'bold 16px Arial'; 
        ctx.textAlign = "right"; ctx.fillStyle = '#00d1b2'; ctx.fillText(`${manualData.kda} KDA`, cx - 10, statsY);
        ctx.textAlign = "center"; ctx.fillStyle = '#666'; ctx.fillText("•", cx, statsY);
        ctx.textAlign = "left"; ctx.fillStyle = '#ccc'; ctx.fillText(`${manualData.csMin} CS/m`, cx + 10, statsY);

        const link = document.createElement('a');
        link.download = `kda-vs-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (e) {
        alert("Erreur : " + e.message);
    } finally {
        setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111] p-6 font-sans text-white" onClick={() => setShowHistory(false)}>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center text-yellow-500 tracking-wider">LoL Montage Tool <span className="text-white text-lg font-normal opacity-50">| VS Mode</span></h1>
        
        <div className="flex flex-col xl:flex-row gap-8 items-start">
            
            <div className="w-full xl:w-1/3 space-y-6">
                
                {/* --- INPUTS --- */}
                <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-xl relative z-50">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input 
                                value={gameName} 
                                onChange={e => setGameName(e.target.value)} 
                                onFocus={() => setShowHistory(true)}
                                onClick={(e) => {e.stopPropagation(); setShowHistory(true);}}
                                onKeyDown={handleKeyDown}
                                placeholder="Nom du Joueur" 
                                className="w-full bg-gray-900 p-3 rounded-l-lg border border-gray-600 focus:border-yellow-500 outline-none text-white font-bold"
                            />
                            {showHistory && recentSearches.length > 0 && (
                                <div className="absolute top-full left-0 w-[150%] bg-gray-800 border border-gray-600 mt-1 rounded-lg shadow-xl overflow-hidden z-50">
                                    <div className="p-2 text-[10px] text-gray-400 uppercase tracking-widest bg-gray-900/50 flex justify-between items-center">
                                        <span>Récents</span>
                                        <button onClick={(e)=>{e.stopPropagation(); setRecentSearches([]); localStorage.removeItem('lol_kda_history');}} className="hover:text-red-400"><X size={12}/></button>
                                    </div>
                                    {recentSearches.map((item, idx) => (
                                        <div 
                                            key={idx} 
                                            onClick={(e) => { e.stopPropagation(); loadFromHistory(item); }}
                                            className="p-3 hover:bg-gray-700 cursor-pointer flex justify-between items-center border-b border-gray-700 last:border-0"
                                        >
                                            <div>
                                                <div className="font-bold text-sm text-white">{item.name}</div>
                                                <div className="text-xs text-gray-400">#{item.tag}</div>
                                            </div>
                                            <button onClick={(e)=>deleteFromHistory(e, idx)} className="text-gray-500 hover:text-red-400 p-1"><X size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center bg-gray-900 border-y border-r border-gray-600 rounded-r-lg px-2">
                            <span className="text-gray-500 font-bold mr-1">#</span>
                            <input 
                                value={tagLine} 
                                onChange={e => setTagLine(e.target.value)} 
                                onKeyDown={handleKeyDown}
                                placeholder="TAG" 
                                className="w-16 bg-transparent outline-none text-white font-bold uppercase"
                            />
                        </div>
                        <button onClick={fetchMatches} disabled={loading} className="bg-blue-600 hover:bg-blue-500 px-4 rounded-lg transition disabled:opacity-50">
                            {loading ? <Loader2 className="animate-spin"/> : <Search/>}
                        </button>
                    </div>
                    {error && <div className="mt-3 text-sm text-red-400 bg-red-900/20 p-2 rounded flex items-center gap-2"><AlertCircle size={16}/> {error}</div>}
                </div>

                <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-xl max-h-[400px] overflow-y-auto custom-scrollbar relative z-0">
                    <h3 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-wider">Historique</h3>
                    {matches.length === 0 ? <div className="text-gray-500 text-center italic py-8">Aucun match chargé</div> : (
                        <div className="space-y-2">
                            {matches.map(m => (
                                <button key={m.id} onClick={() => selectMatch(m)} className={`w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-700 transition group border-l-4 ${m.victory ? 'border-blue-500 bg-blue-900/10' : 'border-red-500 bg-red-900/10'}`}>
                                    <div className="flex items-center gap-3">
                                        <img src={getChampionIcon(m.champion)} className="w-10 h-10 rounded-full border border-gray-600"/>
                                        <div className="text-left leading-tight"><div className="font-bold text-sm text-gray-200">{m.champion}</div><div className="text-[10px] text-gray-400">{m.role}</div></div>
                                    </div>
                                    <div className="flex items-center gap-3 opacity-60 group-hover:opacity-100 transition">
                                        <div className="text-right leading-tight"><div className="text-xs font-bold text-gray-300">{m.oppChampion || '?'}</div><div className="text-[10px] text-red-400">VS</div></div>
                                        <img src={getChampionIcon(m.oppChampion)} className="w-8 h-8 rounded-full border border-red-900/50"/>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-xl relative z-0">
                    <h3 className="text-gray-400 text-xs font-bold mb-4 uppercase tracking-wider">Éditeur Manuel</h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
                            <div><label className="text-[10px] text-blue-400 uppercase font-bold mb-1 block">Moi</label><input className="bg-gray-800 w-full p-2 rounded text-sm border border-gray-600" value={manualData.champion} onChange={e=>handleManualChange('champion', e.target.value)}/></div>
                            <div><label className="text-[10px] text-red-400 uppercase font-bold mb-1 block">Adversaire</label><input className="bg-gray-800 w-full p-2 rounded text-sm border border-gray-600" value={manualData.oppChampion || ''} onChange={e=>handleManualChange('oppChampion', e.target.value)}/></div>
                        </div>
                        
                        {/* --- DUOS AVEC ROLES MODIFIABLES --- */}
                        <div className="grid grid-cols-2 gap-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
                            <div className="space-y-1">
                                <label className="text-[10px] text-blue-300 uppercase font-bold block">Mon Duo</label>
                                <div className="flex gap-1">
                                    <input className="bg-gray-800 w-full p-2 rounded text-xs border border-gray-600" placeholder="Champion" value={manualData.teammate || ''} onChange={e=>handleManualChange('teammate', e.target.value)}/>
                                    <select className="bg-gray-800 w-16 p-1 rounded text-xs border border-gray-600" value={manualData.teammateRole || ''} onChange={e=>handleManualChange('teammateRole', e.target.value)}>
                                        <option value="">Aucun</option><option value="TOP">Top</option><option value="JUNGLE">Jgl</option><option value="MIDDLE">Mid</option><option value="BOTTOM">Bot</option><option value="UTILITY">Sup</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] text-red-300 uppercase font-bold block">Duo Adv.</label>
                                <div className="flex gap-1">
                                    <input className="bg-gray-800 w-full p-2 rounded text-xs border border-gray-600" placeholder="Champion" value={manualData.oppTeammate || ''} onChange={e=>handleManualChange('oppTeammate', e.target.value)}/>
                                    <select className="bg-gray-800 w-16 p-1 rounded text-xs border border-gray-600" value={manualData.oppTeammateRole || ''} onChange={e=>handleManualChange('oppTeammateRole', e.target.value)}>
                                        <option value="">Aucun</option><option value="TOP">Top</option><option value="JUNGLE">Jgl</option><option value="MIDDLE">Mid</option><option value="BOTTOM">Bot</option><option value="UTILITY">Sup</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
                            <div>
                                <label className="text-[10px] text-yellow-500 uppercase font-bold mb-1 block">Mon Rang</label>
                                <select className="bg-gray-800 w-full p-1 rounded text-xs" value={manualData.rankTier} onChange={e=>handleManualChange('rankTier', e.target.value)}>
                                    <option value="UNRANKED">Unr.</option><option value="IRON">Iron</option><option value="BRONZE">Bronze</option><option value="SILVER">Silver</option><option value="GOLD">Gold</option><option value="PLATINUM">Plat</option><option value="EMERALD">Emer</option><option value="DIAMOND">Dia</option><option value="MASTER">Mas</option><option value="GRANDMASTER">GM</option><option value="CHALLENGER">Chall</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-yellow-500 uppercase font-bold mb-1 block">Division</label>
                                <select className="bg-gray-800 w-full p-1 rounded text-xs" value={manualData.rankDiv} onChange={e=>handleManualChange('rankDiv', e.target.value)}>
                                    <option value="I">I</option><option value="II">II</option><option value="III">III</option><option value="IV">IV</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 p-3 bg-red-900/20 rounded-lg border border-red-700/50">
                            <div>
                                <label className="text-[10px] text-red-400 uppercase font-bold mb-1 block">Rang Adv.</label>
                                <select className="bg-gray-800 w-full p-1 rounded text-xs" value={manualData.oppRankTier} onChange={e=>handleManualChange('oppRankTier', e.target.value)}>
                                    <option value="UNRANKED">Unr.</option><option value="IRON">Iron</option><option value="BRONZE">Bronze</option><option value="SILVER">Silver</option><option value="GOLD">Gold</option><option value="PLATINUM">Plat</option><option value="EMERALD">Emer</option><option value="DIAMOND">Dia</option><option value="MASTER">Mas</option><option value="GRANDMASTER">GM</option><option value="CHALLENGER">Chall</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-red-400 uppercase font-bold mb-1 block">Div. Adv.</label>
                                <select className="bg-gray-800 w-full p-1 rounded text-xs" value={manualData.oppRankDiv} onChange={e=>handleManualChange('oppRankDiv', e.target.value)}>
                                    <option value="I">I</option><option value="II">II</option><option value="III">III</option><option value="IV">IV</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-1"><label className="text-[10px] text-gray-500 uppercase block mb-1">Kills</label><input type="number" className="bg-gray-800 w-full p-2 rounded text-center font-bold" value={manualData.kills} onChange={e=>handleManualChange('kills', e.target.value)}/></div>
                            <div className="col-span-1"><label className="text-[10px] text-gray-500 uppercase block mb-1">Deaths</label><input type="number" className="bg-gray-800 w-full p-2 rounded text-center font-bold text-red-400" value={manualData.deaths} onChange={e=>handleManualChange('deaths', e.target.value)}/></div>
                            <div className="col-span-1"><label className="text-[10px] text-gray-500 uppercase block mb-1">Assists</label><input type="number" className="bg-gray-800 w-full p-2 rounded text-center font-bold" value={manualData.assists} onChange={e=>handleManualChange('assists', e.target.value)}/></div>
                            <div className="col-span-1"><label className="text-[10px] text-gray-500 uppercase block mb-1">CS/m</label><input type="text" className="bg-gray-800 w-full p-2 rounded text-center text-sm" value={manualData.csMin} onChange={e=>handleManualChange('csMin', e.target.value)}/></div>
                        </div>
                        <select className="w-full bg-gray-800 p-3 rounded-lg border border-gray-600 text-sm font-bold" value={manualData.victory?'victory':'defeat'} onChange={e => handleManualChange('victory', e.target.value === 'victory')}>
                            <option value="victory">🔵 Victoire</option>
                            <option value="defeat">🔴 Défaite</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="w-full xl:w-2/3 xl:sticky xl:top-8 relative z-0">
                <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 shadow-2xl flex flex-col items-center">
                    <h2 className="text-gray-400 text-sm font-bold mb-6 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Aperçu en temps réel
                    </h2>
                    
                    <div 
                        ref={bannerRef}
                        className="relative w-[700px] h-[170px] rounded-lg overflow-hidden shadow-2xl transition-all select-none origin-top scale-75 md:scale-100"
                        style={{ background: manualData.victory ? 'linear-gradient(90deg, #312e81 0%, #1e3a8a 100%)' : 'linear-gradient(90deg, #7f1d1d 0%, #881337 100%)' }}
                    >
                        <div className={`absolute left-0 top-0 bottom-0 w-[8px] ${manualData.victory ? 'bg-[#5383E8]' : 'bg-[#E84057]'}`}></div>

                        <div className="absolute left-[20px] top-0 h-full w-[150px]">
                            {manualData.teammate && (
                                <>
                                <img src={getChampionIcon(manualData.teammate)} className="absolute top-[45px] left-[45px] w-[55px] h-[55px] rounded-full border-2 border-purple-400 opacity-80 z-0 bg-black object-cover shadow-lg"/>
                                {manualData.teammateRole && <div className="absolute top-[83px] left-[85px] w-[20px] h-[20px] bg-[#1e1e1e] border border-[#555] z-10 flex items-center justify-center shadow"><img src={getRoleIcon(manualData.teammateRole)} className="w-[16px] h-[16px]"/></div>}
                                </>
                            )}
                            <img src={getChampionIcon(manualData.champion)} className="absolute top-[47px] left-0 w-[75px] h-[75px] rounded-full border-[3px] border-[#C8AA6E] z-20 bg-black object-cover shadow-xl"/>
                            {manualData.role && <div className="absolute top-[98px] left-[0px] w-[24px] h-[24px] bg-[#111] border border-[#C8AA6E] z-30 flex items-center justify-center shadow-md"><img src={getRoleIcon(manualData.role)} className="w-[20px] h-[20px]"/></div>}
                            
                            {manualData.rankTier && manualData.rankTier !== 'UNRANKED' && (
                                <div className="absolute top-[135px] left-[20px] flex items-center gap-1">
                                    <img src={getRankIcon(manualData.rankTier)} className="w-[30px] h-[30px]"/>
                                    <span className="text-[12px] font-bold text-[#C8AA6E] uppercase">{manualData.rankTier} {manualData.rankDiv}</span>
                                </div>
                            )}
                        </div>

                        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
                            <div className="flex items-center gap-3 text-4xl font-bold font-sans mb-1 drop-shadow-lg" style={{marginTop: '-10px'}}>
                                <span>{manualData.kills}</span><span className="text-gray-500 text-3xl">/</span><span className="text-[#ff5859]">{manualData.deaths}</span><span className="text-gray-500 text-3xl">/</span><span>{manualData.assists}</span>
                            </div>
                            <div className="flex items-center gap-3 text-base font-medium drop-shadow-md">
                                <span className="text-[#00d1b2] font-bold">{manualData.kda} KDA</span><span className="text-gray-500">•</span><span className="text-gray-300">{manualData.csMin} CS/m</span>
                            </div>
                        </div>

                        <div className="absolute right-[20px] top-0 h-full w-[150px]">
                            {manualData.oppTeammate && (
                                <>
                                <img src={getChampionIcon(manualData.oppTeammate)} className="absolute top-[45px] right-[45px] w-[55px] h-[55px] rounded-full border-2 border-red-800 opacity-80 z-0 bg-black object-cover shadow-lg"/>
                                {manualData.oppTeammateRole && <div className="absolute top-[83px] right-[85px] w-[20px] h-[20px] bg-[#1e1e1e] border border-[#555] z-10 flex items-center justify-center shadow"><img src={getRoleIcon(manualData.oppTeammateRole)} className="w-[16px] h-[16px]"/></div>}
                                </>
                            )}
                            {manualData.oppChampion && (
                                <>
                                <img src={getChampionIcon(manualData.oppChampion)} className="absolute top-[47px] right-0 w-[75px] h-[75px] rounded-full border-[3px] border-red-600 z-20 bg-black object-cover shadow-xl"/>
                                {manualData.oppRole && <div className="absolute top-[98px] right-[51px] w-[24px] h-[24px] bg-[#111] border border-red-600 z-30 flex items-center justify-center shadow-md"><img src={getRoleIcon(manualData.oppRole)} className="w-[20px] h-[20px]"/></div>}
                                </>
                            )}

                            {manualData.oppRankTier && manualData.oppRankTier !== 'UNRANKED' && (
                                <div className="absolute top-[135px] right-[20px] flex items-center justify-end gap-1">
                                    <span className="text-[12px] font-bold text-[#C8AA6E] uppercase">{manualData.oppRankTier} {manualData.oppRankDiv}</span>
                                    <img src={getRankIcon(manualData.oppRankTier)} className="w-[30px] h-[30px]"/>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-10 flex flex-col items-center gap-2">
                        <button onClick={downloadBanner} disabled={isGenerating} className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-10 py-4 rounded-xl shadow-lg font-bold text-lg flex items-center gap-3 transform hover:-translate-y-1 transition disabled:opacity-50 disabled:cursor-not-allowed">
                            {isGenerating ? <Loader2 className="animate-spin"/> : <Download size={24}/>} {isGenerating ? "Génération..." : "Télécharger l'image"}
                        </button>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}