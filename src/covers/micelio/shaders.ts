// GLSL ES 3.00 of the "Micélio" cover, ported unchanged from the approved prototype (2026-11-11; the CSP forbids
// inline scripts, so the shaders live here as strings). One agent per vertex in UPDATE (transform feedback): sense
// three points ahead, turn, step, wrap (Jones 2010). Agents are hungry or fed: a hungry one smells the food (the word,
// the headline nodes, the pointer) and stays on it for a while; then it leaves fed, following only trails, so the
// traffic between food sources draws the veins that join them. The pointer's pull (uHung) reaches every agent.

export const TRI = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;

export const UPDATE = `#version 300 es
precision highp float;precision highp sampler2D;
layout(location=0) in vec4 aState;            // x, y in trail texels, heading, fed steps left
uniform sampler2D uTrail,uFood;
uniform vec2 uSize;
uniform uint uFrame;
uniform vec4 uPtr;                            // pointer food: x, y, weight, radius
uniform vec4 uRule;                           // sensor offset, sensor angle, turn, step
uniform vec4 uMix;                            // food weight, static food amount, jitter, respawn rate
uniform vec4 uLife;                           // sensed-trail cap, leave rate, fed steps, 1 = fed agents ignore food
uniform vec2 uFar;                            // pointer far field: length, strength
uniform vec2 uHung;                           // pointer pull felt by every agent, even on food or fed: strength, length
out vec4 vState;
uint h32(uint x){x^=x>>16;x*=0x7feb352dU;x^=x>>15;x*=0x846ca68bU;x^=x>>16;return x;}
float u01(uint h){return float(h>>8)*(1./16777216.);}
float disc(vec2 p){return 1.-smoothstep(0.,uPtr.w,length(p-uPtr.xy));}
float field(vec2 p,float w){
  vec2 uv=p/uSize;
  float s=min(textureLod(uTrail,uv,0.).r,uLife.x);
  if(w<=0.)return s+uHung.x*uPtr.z*exp(-length(p-uPtr.xy)/uHung.y);
  float near=textureLod(uFood,uv,1.5).r*uMix.y,d=disc(p);
  float f=min(near+(.35*textureLod(uFood,uv,5.5).r+.15*textureLod(uFood,uv,8.).r)*uMix.y,1.)
    +uPtr.z*(d+uFar.y*exp(-length(p-uPtr.xy)/uFar.x));
  return mix(s+w*f,w*(2.+uPtr.z*(1.+uFar.y)),smoothstep(.3,.8,max(near,uPtr.z*d)))   // on food the field is flat: a hungry agent spreads
    +uHung.x*uPtr.z*exp(-length(p-uPtr.xy)/uHung.y);
}
void main(){
  vec2 p=aState.xy;float a=aState.z,fed=aState.w;
  uint h=h32(uint(gl_VertexID)^h32(uFrame));
  float r1=u01(h);h=h32(h);float r2=u01(h);h=h32(h);float r3=u01(h);h=h32(h);float r4=u01(h);
  float w=fed>0.&&uLife.w>0.?0.:uMix.x;
  float F=field(p+uRule.x*vec2(cos(a),sin(a)),w);
  float L=field(p+uRule.x*vec2(cos(a+uRule.y),sin(a+uRule.y)),w);
  float R=field(p+uRule.x*vec2(cos(a-uRule.y),sin(a-uRule.y)),w);
  if(F<L&&F<R)a+=r1<.5?uRule.z:-uRule.z;       // centre smallest: either side
  else if(L>F||R>F)a+=L>R?uRule.z:-uRule.z;    // one side larger: turn to it; centre largest: keep
  a+=(r2-.5)*uMix.z;
  p=mod(p+uRule.w*vec2(cos(a),sin(a)),uSize);
  float hs=textureLod(uFood,p/uSize,1.5).r*uMix.y,hp=uPtr.z*disc(p);
  if(fed>0.)fed-=1.;
  else if((hs>.5&&r4<uLife.y)||(hp>.5&&r4<4.*uLife.y))fed=uLife.z*(.6+.8*r1);   // a meal at the pointer is short
  if(r3<uMix.w*(1.-.9*hs)){                    // new dust; it germinates on uneaten food when it finds some
    a=r1*6.2831853;fed=0.;
    for(int i=0;i<6;i++){
      h=h32(h);p.x=u01(h)*uSize.x;h=h32(h);p.y=u01(h)*uSize.y;
      if(textureLod(uFood,p/uSize,1.5).r*uMix.y>.6&&textureLod(uTrail,p/uSize,0.).r<uLife.x)break;
    }
  }
  vState=vec4(p,mod(a,6.2831853),fed);
}`;

export const DEPOSIT_VS = `#version 300 es
layout(location=0) in vec4 aState;uniform vec2 uSize;
void main(){gl_Position=vec4(aState.xy/uSize*2.-1.,0.,1.);gl_PointSize=1.;}`;

export const DEPOSIT_FS = `#version 300 es
precision highp float;uniform float uDep;out vec4 o;
void main(){o=vec4(uDep,uDep*.0625,0.,0.);}`;

export const DIFFUSE = `#version 300 es
precision highp float;precision highp sampler2D;
uniform sampler2D uTrail;uniform vec2 uPx;uniform vec2 uDecay;out vec4 o;
void main(){
  vec2 uv=gl_FragCoord.xy*uPx,d=.5*uPx;
  vec4 s=.25*(textureLod(uTrail,uv-d,0.)+textureLod(uTrail,uv+vec2(d.x,-d.y),0.)
    +textureLod(uTrail,uv+vec2(-d.x,d.y),0.)+textureLod(uTrail,uv+d,0.));
  o=vec4(s.r*uDecay.x,s.g*uDecay.y,0.,1.);
}`;

export const DISPLAY = `#version 300 es
precision highp float;precision highp sampler2D;
uniform sampler2D uTrail,uFood;uniform vec2 uRes;uniform vec2 uTap;
uniform vec4 uLook;                           // exposure, mask amount, exit wipe
uniform vec4 uPtr;                            // pointer food in canvas pixels: x, y, radius, glow
out vec4 o;
vec3 ramp(float t){
  const vec3 a=vec3(.020,.012,.039),b=vec3(.231,.059,.420),c=vec3(1.,.302,.427),d=vec3(1.,.914,.659);
  t=clamp(t,0.,1.)*3.;
  return t<1.?mix(a,b,t):t<2.?mix(b,c,t-1.):mix(c,d,t-2.);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec4 tr=textureLod(uTrail,uv,0.);
  float t=pow(1.-exp(-uLook.x*tr.r),uLook.w);
  vec3 col=ramp(t);
  col+=(1.-exp(-1.2*tr.g))*(1.-t)*vec3(.03,.17,.34);
  col+=uLook.y*textureLod(uFood,uv,.6).r*(1.-t)*vec3(1.,.91,.66);
  col+=uPtr.w*(1.-smoothstep(0.,uPtr.z,length(gl_FragCoord.xy-uPtr.xy)))*(1.-t)*vec3(1.,.91,.66);
  vec2 p=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
  col*=1.-.5*smoothstep(.35,1.15,length(p));
  if(uLook.z>0.){
    float dd=length(gl_FragCoord.xy-uTap)/min(uRes.x,uRes.y);
    col=mix(col,vec3(1.,.965,.87),smoothstep(0.,.35,uLook.z*2.45-dd));
  }
  o=vec4(col,1.);
}`;
