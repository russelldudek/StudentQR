// Independent Code 128-B fixture: start 104, 083, checksum 19, stop 106.
function barcodePixels({sideways=false,invalidChecksum=false}={}){
  const symbols=[[2,1,1,2,1,4],[1,2,3,1,2,2],[3,1,1,2,2,2],[2,2,1,1,3,2],invalidChecksum?[1,2,3,1,2,2]:[2,2,1,1,3,2],[2,3,3,1,1,1,2]];
  const width=324,height=90,data=new Uint8ClampedArray(width*height*4).fill(255);let x=60;
  for(const symbol of symbols){let dark=true;for(const modules of symbol){if(dark)for(let y=0;y<height;y++)for(let dx=0;dx<modules*3;dx++){const p=(y*width+x+dx)*4;data[p]=data[p+1]=data[p+2]=0;}x+=modules*3;dark=!dark;}}
  if(!sideways)return{width,height,data};const rotated=new Uint8ClampedArray(data.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)rotated.set(data.subarray((y*width+x)*4,(y*width+x)*4+4),(x*height+height-1-y)*4);
  return{width:height,height:width,data:rotated};
}
function multiPixels(){
  const z=require('../../assets/zxing-0.21.3.min.js'),qr=new z.QRCodeWriter().encode('085',z.BarcodeFormat.QR_CODE,180,180,new Map()),one=barcodePixels();
  const width=600,height=220,data=new Uint8ClampedArray(width*height*4).fill(255);
  for(let y=0;y<one.height;y++)for(let x=0;x<one.width;x++)data.set(one.data.subarray((y*one.width+x)*4,(y*one.width+x)*4+4),((y+30)*width+x)*4);
  for(let y=0;y<180;y++)for(let x=0;x<180;x++)if(qr.get(x,y)){const p=((y+20)*width+x+380)*4;data[p]=data[p+1]=data[p+2]=0;}
  return{width,height,data};
}
module.exports={barcodePixels,multiPixels};
