import { run, COORDS } from './s1lib.ts';
const hav=(a:any,b:any)=>{const R=6371,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;const x=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
const MIN_STOPS=5, MIN_KM=1;
type Piece={s:number;e:number;pass:boolean;km:number};
function pieces(rows:any[],label:string,pass:(r:any)=>boolean):Piece[]{
  const out:Piece[]=[]; let a=0;
  for(let i=1;i<=rows.length;i++) if(i===rows.length||pass(rows[i])!==pass(rows[a])){
    let km=0; for(let j=a+1;j<i;j++){const p=COORDS.get(label+'|'+rows[j-1].stop),q=COORDS.get(label+'|'+rows[j].stop); if(p&&q)km+=hav(p,q);}
    out.push({s:a,e:i-1,pass:pass(rows[a]),km}); a=i; }
  return out;
}
const short=(p:Piece)=>(p.e-p.s+1)<MIN_STOPS||p.km<MIN_KM;
const mode=process.argv[2]||'T0'; const basis=process.argv[3]||'vis'; // vis: pass = pub<=filter ; gate: pass = !refused
const r=run(mode);
let intPass=0,intShort=0,multiFrag0=0,multiFrag1=0,nstretch=0,frag0=0,frag1=0,pass0=0,pass1=0,ref0=0,ref1=0,chg=0,pf=0,fp=0,own20=0,multi0=0,one1=0,islandsPass=0,removedPass=0,stretchesWithIsland=0,stretchesFixedAll=0, ownRows:any[]=[];
const detail:any[]=[];
for(const q of r.seqs){
  // stretch blocks of pooled stops with same sig
  const rs=q.recs; let a=0;
  for(let i=1;i<=rs.length;i++) if(i===rs.length||rs[i].sig!==rs[a].sig){
    if(rs[a].sig!==''){ const blk=rs.slice(a,i).filter((x:any)=>x.g&&x.pub!=null);
      if(blk.length){ nstretch++;
        const pass=basis==='vis'?(x:any)=>x.pub<=q.filter:(x:any)=>!x.g.refused;
        const P=pieces(blk,q.label,pass); frag0+=P.length; pass0+=P.filter(p=>p.pass).length; ref0+=P.filter(p=>!p.pass).length; if(P.length>1)multi0++;
        // islands: passing pieces between refused pieces, short
        const newPub=blk.map((x:any)=>x.pub); let changedHere=false;
        P.forEach((p,k)=>{ if(p.pass&&k>0&&k<P.length-1&&short(p)){ islandsPass++;
            const nb=Math.max(blk[P[k-1].e].pub,blk[P[k+1].s].pub);
            for(let j=p.s;j<=p.e;j++){ if(nb>newPub[j]){ newPub[j]=nb; } } changedHere=true; }});
        // after
        const blk2=blk.map((x:any,j:number)=>({...x,pub:newPub[j]}));
        const P2=pieces(blk2,q.label,pass===undefined?pass:(basis==='vis'?(x:any)=>x.pub<=q.filter:(x:any)=>!x.g.refused));
        // gate basis: pass flag from refused doesn't change with pub; handle: after-S pass = original pass && pub unchanged
        let P2g=P2; if(basis!=='vis'){ P2g=pieces(blk2.map((x:any,j:number)=>({...x,g:{refused:x.g.refused||newPub[j]!==blk[j].pub}})),q.label,(x:any)=>!x.g.refused); }
        if(P.length>1){multiFrag0+=P.length;multiFrag1+=P2g.length;} P.forEach((p,k)=>{if(p.pass&&k>0&&k<P.length-1){intPass++;if(short(p))intShort++;}});
        frag1+=P2g.length; pass1+=P2g.filter(p=>p.pass).length; ref1+=P2g.filter(p=>!p.pass).length; if(P2g.length===1&&P.length>1)one1++;
        if(P.length>1&&changedHere)stretchesWithIsland++;
        blk.forEach((x:any,j:number)=>{ if(newPub[j]!==x.pub){ chg++; const was=x.pub<=q.filter, now=newPub[j]<=q.filter; if(was&&!now){pf++; if(x.pub<20)own20++;} if(!was&&now)fp++; }});
      } }
    a=i; }
}
console.log('  interior passing pieces',intPass,'of which under tail min',intShort,'| fragments in multi-piece stretches before',multiFrag0,'after',multiFrag1);
console.log(mode,basis,'| stretches',nstretch,'multi-piece',multi0,'| fragments before',frag0,`(pass ${pass0}, refused ${ref0}) after`,frag1,`(pass ${pass1}, refused ${ref1}) | short passing islands between refused pieces`,islandsPass,'| stops changed',chg,'pass->fail(visible)',pf,'(own pub<20:',own20,') fail->pass',fp,'| stretches multi->one colour',one1);
// the named cases (pattern 0)
if(process.argv[4]){ for(const q of r.seqs){ if(q.pi!==0)continue; if(q.label!=='900 EB eve'&&q.label!=='900 WB eve')continue; const rs=q.recs; const rng=q.label==='900 EB eve'?[40,60]:[30,rs.length]; const pass=basis==='vis'?(x:any)=>x.pub<=q.filter:(x:any)=>!x.g?.refused;
  console.log(q.label,'len',rs.length); let a=0; for(let i=1;i<=rs.length;i++) if(i===rs.length||rs[i].sig!==rs[a].sig){ const blk=rs.slice(a,i); console.log(' block',a,i-1,'sig',rs[a].sig||'(unpooled)'); if(rs[a].sig!==''){ const P=pieces(blk,q.label,pass); console.log('  ',P.map(p=>`${p.s+a}-${p.e+a}:${p.pass?'PASS':'ref'} ${p.e-p.s+1}st ${p.km.toFixed(2)}km`).join(' | ')); } a=i; } } }
