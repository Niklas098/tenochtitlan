// src/scene/city/city.js
import * as THREE from 'three';

// --- Externe Texturen optional laden (Vite: aus /public) ---
function tryLoadTexture(url, onOK, onFail) {
    const loader = new THREE.TextureLoader();
    loader.load(
        url,
        (tx) => {
            tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
            tx.colorSpace = THREE.SRGBColorSpace;
            onOK(tx);
        },
        undefined,
        () => onFail && onFail()
    );
}

// --- Procedural sand (beiger, körniger, leichte Dünen) ---
function makeSandTexture(size=1024){
    const c=document.createElement('canvas'); c.width=c.height=size;
    const g=c.getContext('2d');
    function noise(x,y){return (Math.sin(x*12.98+y*78.23)*43758.5)%1;}
    function fbm(x,y){let v=0,f=1,a=0.5;for(let i=0;i<6;i++){v+=a*noise(x*f,y*f);f*=2;a*=0.5;}return v;}
    const A=new THREE.Color(0xE7D9BF);
    const B=new THREE.Color(0xCDBB9B);
    const C=new THREE.Color(0xB8A688);
    const img=g.createImageData(size,size);
    for(let y=0;y<size;y++){
        for(let x=0;x<size;x++){
            const u=x/size,v=y/size;
            const gf=fbm(u*26,v*26);
            const dunes = 0.5 + 0.5*Math.sin(u*14.0 + Math.sin(v*3.0)*2.0);
            const m = THREE.MathUtils.clamp(0.55*gf + 0.25*dunes, 0, 1);
            const col = A.clone().lerp(B, m).lerp(C, 0.1*gf);
            const i=(y*size+x)*4;
            img.data[i]=col.r*255; img.data[i+1]=col.g*255; img.data[i+2]=col.b*255; img.data[i+3]=255;
        }
    }
    g.putImageData(img,0,0);
    const t=new THREE.CanvasTexture(c);
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(36,36);
    t.anisotropy = 8;
    return t;
}

// feinere Normalmap -> Lichtrichtung sichtbar
function makeSandNormal(size=512){
    const c=document.createElement('canvas'); c.width=c.height=size;
    const g=c.getContext('2d');
    function noise(x,y){return (Math.sin(x*12.98+y*78.23)*43758.5)%1;}
    function fbm(x,y){let v=0,f=1,a=0.5;for(let i=0;i<5;i++){v+=a*noise(x*f,y*f);f*=2;a*=0.5;}return v;}
    const img=g.createImageData(size,size);
    for(let y=0;y<size;y++){
        for(let x=0;x<size;x++){
            const u = x/size, v = y/size;
            const e = 1.2/size;
            const h  = fbm(u*48, v*48);
            const hx = fbm((u+e)*48, v*48) - h;
            const hy = fbm(u*48, (v+e)*48) - h;
            const nx = -hx*2.6, ny = -hy*2.6, nz = 1.0;
            const l = Math.sqrt(nx*nx+ny*ny+nz*nz);
            const r = (nx/l)*0.5+0.5, gch=(ny/l)*0.5+0.5, b=(nz/l)*0.5+0.5;
            const i=(y*size+x)*4;
            img.data[i]=r*255; img.data[i+1]=gch*255; img.data[i+2]=b*255; img.data[i+3]=255;
        }
    }
    g.putImageData(img,0,0);
    const t=new THREE.CanvasTexture(c);
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(64,64);
    return t;
}

// minimale Boden-Unebenheiten
function displaceGroundGeometry(geo, amount=0.18, scale=0.0038) {
    const pos = geo.attributes.position;
    for (let i=0; i<pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const h = Math.sin(x*scale)*Math.cos(z*scale)*amount
            + Math.sin((x+z)*scale*0.71)*amount*0.35;
        pos.setY(i, pos.getY(i) + h);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
}

export function buildCity(scene, { groundSize=2400 } = {}) {
    const seg = 256;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, seg, seg);
    groundGeo.rotateX(-Math.PI/2);
    displaceGroundGeometry(groundGeo);

    let groundMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.0,
        map: makeSandTexture(),
        normalMap: makeSandNormal()
    });

    // Externe Texturen laden, wenn vorhanden (in /public/textures)
    tryLoadTexture('/textures/teno_sand_albedo_1024.png',
        (tx) => { groundMat.map = tx; groundMat.needsUpdate = true; },
        () => tryLoadTexture('/textures/sand_base.jpg',
            (tx) => { groundMat.map = tx; groundMat.needsUpdate = true; },
            ()  => {/* behalte prozedural */}
        )
    );
    tryLoadTexture('/textures/teno_sand_normal_1024.png',
        (tx) => { groundMat.normalMap = tx; groundMat.needsUpdate = true; },
        () => {/* optional */}
    );

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);
}

export function updateCity(dt, t, scene, activeCamera) {
    // aktuell nichts
}
