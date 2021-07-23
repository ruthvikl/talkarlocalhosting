//Components
//Language Translator
// import translate from './Languages/translate';
// import language from './Languages/language'

const chromakeyShader = {
  schema: {
    src: { type: 'map' },
    color: { default: { x: 0.1, y: 0.9, z: 0.2 }, type: 'vec3', is: 'uniform' },
    transparent: { default: true, is: 'uniform' },
  },

  init: function (data) {
    var videoTexture = new THREE.VideoTexture(data.src);
    videoTexture.minFilter = THREE.LinearFilter;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        color: {
          type: 'c',
          value: data.color,
        },
        texture: {
          type: 't',
          value: videoTexture,
        },
      },
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
    });
  },

  update: function (data) {
    this.material.color = data.color;
    this.material.src = data.src;
    this.material.transparent = data.transparent;
  },

  vertexShader: [
    'varying vec2 vUv;',
    'void main(void)',
    '{',
    'vUv = uv;',
    'vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );',
    'gl_Position = projectionMatrix * mvPosition;',
    '}',
  ].join('\n'),

  fragmentShader: [
    'uniform sampler2D texture;',
    'uniform vec3 color;',
    'varying vec2 vUv;',
    'void main(void)',
    '{',
    'vec3 tColor = texture2D( texture, vUv ).rgb;',
    'float a = (length(tColor - color) - 0.5) * 7.0;',
    'gl_FragColor = vec4(tColor, a);',
    '}',
  ].join('\n'),
};

const modelOpacityComponent = {
  schema: { default: 1.0 },
  init: function () {
    this.el.addEventListener('model-loaded', this.update.bind(this));
  },
  update: function () {
    var mesh = this.el.getObject3D('mesh');
    var data = this.data;
    if (!mesh) {
      return;
    }
    mesh.traverse(function (node) {
      if (node.isMesh) {
        node.material.opacity = data;
        node.material.transparent = data < 1.0;
        node.material.needsUpdate = true;
      }
    });
  },
};

const ensureMaterialArray = (material) => {
  if (!material) {
    return [];
  }

  if (Array.isArray(material)) {
    return material;
  }

  if (material.materials) {
    return material.materials;
  }

  return [material];
};

const applyEnvMap = (mesh, materialNames, envMap, reflectivity) => {
  if (!mesh) return;

  materialNames = materialNames || [];

  mesh.traverse((node) => {
    if (!node.isMesh) {
      return;
    }
    const meshMaterials = ensureMaterialArray(node.material);

    meshMaterials.forEach((material) => {
      if (material && !('envMap' in material)) return;
      if (materialNames.length && materialNames.indexOf(material.name) === -1)
        return;

      material.envMap = envMap;
      material.reflectivity = reflectivity;
      material.needsUpdate = true;
    });
  });
};

const toUrl = (urlOrId) => {
  const img = document.querySelector(urlOrId);
  return img ? img.src : urlOrId;
};

const cubeEnvMapComponent = {
  multiple: true,
  schema: {
    posx: { default: '#posx' },
    posy: { default: '#posy' },
    posz: { default: '#posz' },
    negx: { default: '#negx' },
    negy: { default: '#negy' },
    negz: { default: '#negz' },
    extension: { default: 'jpg', oneOf: ['jpg', 'png'] },
    format: { default: 'RGBFormat', oneOf: ['RGBFormat', 'RGBAFormat'] },
    enableBackground: { default: false },
    reflectivity: { default: 1, min: 0, max: 1 },
    materials: { default: [] },
  },
  init: function () {
    const data = this.data;
    data.isInitialized = false;
    this.texture = new THREE.CubeTextureLoader().load([
      toUrl(data.posx),
      toUrl(data.negx),
      toUrl(data.posy),
      toUrl(data.negy),
      toUrl(data.posz),
      toUrl(data.negz),
    ]);
    this.texture.format = THREE[data.format];

    this.object3dsetHandler = () => {
      const mesh = this.el.getObject3D('mesh');
      const data = this.data;
      applyEnvMap(mesh, data.materials, this.texture, data.reflectivity);
    };
    this.el.addEventListener('object3dset', this.object3dsetHandler);
  },
  update: function (oldData) {
    const data = this.data;
    const mesh = this.el.getObject3D('mesh');
    if (!data.isInitialized) {
      data.isInitialized = true;
      applyEnvMap(mesh, data.materials, this.texture, data.reflectivity);
    }

    let addedMaterialNames = [];
    let removedMaterialNames = [];

    if (data.materials.length) {
      if (oldData.materials) {
        addedMaterialNames = data.materials.filter(
          (name) => !oldData.materials.includes(name)
        );
        removedMaterialNames = oldData.materials.filter(
          (name) => !data.materials.includes(name)
        );
      } else {
        addedMaterialNames = data.materials;
      }
    }
    if (addedMaterialNames.length) {
      applyEnvMap(mesh, addedMaterialNames, this.texture, data.reflectivity);
    }
    if (removedMaterialNames.length) {
      applyEnvMap(mesh, removedMaterialNames, null, 1);
    }

    if (oldData.materials && data.reflectivity !== oldData.reflectivity) {
      const maintainedMaterialNames = data.materials.filter((name) =>
        oldData.materials.includes(name)
      );
      if (maintainedMaterialNames.length) {
        applyEnvMap(
          mesh,
          maintainedMaterialNames,
          this.texture,
          data.reflectivity
        );
      }
    }

    if (this.data.enableBackground && !oldData.enableBackground) {
      this.setBackground(this.texture);
    } else if (!this.data.enableBackground && oldData.enableBackground) {
      this.setBackground(null);
    }
  },

  remove: function () {
    this.el.removeEventListener('object3dset', this.object3dsetHandler);
    const mesh = this.el.getObject3D('mesh');
    const data = this.data;
    applyEnvMap(mesh, data.materials, null, 1);
    if (data.enableBackground) {
      this.setBackground(null);
    }
  },

  setBackground: function (texture) {
    this.el.sceneEl.object3D.background = texture;
  },
};

const followCameraComponent = {
  tick: function () {
    const obj = this.el.object3D;
    const camera = document.getElementById('talkar-camera').object3D;

    var objWorldPosition = new THREE.Vector3();
    obj.getWorldPosition(objWorldPosition);

    var camWorldPosition = new THREE.Vector3();
    camera.getWorldPosition(camWorldPosition);

    obj.rotation.y = Math.atan2(
      camWorldPosition.x - objWorldPosition.x,
      camWorldPosition.z - objWorldPosition.z
    );
  },
};

//Constants
const DEVELOPMENT_HOSTNAME = 'localhost';
const PRODUCTION_HOSTNAME = 'talkar.app';

const DEVELOPMENT_URL = 'http://localhost:1337';
// const DEVELOPMENT_URL = 'https://180091fd02db.ngrok.io';
const PRODUCTION_URL = 'https://admin.talkar.app';
const DEVELOPMENT_API_URL = 'http://localhost:1337/experiences';
// const DEVELOPMENT_API_URL = 'https://180091fd02db.ngrok.io/experiences';
const PRODUCTION_API_URL = 'https://admin.talkar.app/experiences';

const APP_TYPE_AFRAME = 'a-frame';
const APP_TYPE_8THWALL = '8th-wall';

const COMPONENT = '__component';

const IMAGE_ASSET = 'assets.image-asset';
const VIDEO_ASSET = 'assets.video-asset';
const AUDIO_ASSET = 'assets.audio-asset';
const MODEL_ASSET = 'assets.model-asset';

const CENTER_ANCHOR = 'center';
const BOTTOM_LEFT_ANCHOR = 'bottomLeft';
const BOTTOM_CENTER_ANCHOR = 'bottomCenter';
const BOTTOM_RIGHT_ANCHOR = 'bottomRight';
const MIDDLE_LEFT_ANCHOR = 'middleLeft';
const MIDDLE_RIGHT_ANCHOR = 'middleRight';
const TOP_LEFT_ANCHOR = 'topLeft';
const TOP_CENTER_ANCHOR = 'topCenter';
const TOP_RIGHT_ANCHOR = 'topRight';

const CONTAINER_ELEMENT = 'elements.container-element';
const IMAGE_ELEMENT = 'elements.image-element';
const IMAGE_CIRCLE_ELEMENT = 'elements.image-circle-element';
const VIDEO_ELEMENT = 'elements.video-element';
const VIDEO_CIRCLE_ELEMENT = 'elements.video-circle-element';
const AUDIO_ELEMENT = 'elements.audio-element';
const MODEL_ELEMENT = 'elements.model-element';
const MODEL_ANIMATABLE_ELEMENT = 'elements.model-animatable-element';
const PARTICLE_ELEMENT = 'elements.particle-element';
const PLANE_ELEMENT = 'elements.plane-element';
const CIRCLE_ELEMENT = 'elements.circle-element';
const CUBE_ELEMENT = 'elements.cube-element';
const SPHERE_ELEMENT = 'elements.sphere-element';

const AMBIENT_LIGHT = 'lights.ambient-light';
const DIRECTIONAL_LIGHT = 'lights.directional-light';
const HEMISPHERE_LIGHT = 'lights.hemisphere-light';
const POINT_LIGHT = 'lights.point-light';
const SPOT_LIGHT = 'lights.spot-light';

const PARTICLE_POSITION_SPERAD = 'positionSpread';
const PARTICLE_VELOCITY_VALUE = 'velocityValue';
const PARTICLE_VELOCITY_SPREAD = 'velocitySpread';
const PARTICLE_ACCELERATION_VALUE = 'accelerationValue';
const PARTICLE_ACCELERATION_SPREAD = 'accelerationSpread';
const PARTICLE_ROTATION_ANGLE = 'rotationAngle';   
const PARTICLE_ROTATION_SPREAD = 'rotationSpread';
const PARTICLE_DRAG_VALUE = 'dragValue';
const PARTICLE_DRAG_SPREAD = 'dragSpread';

const POSITION = 'position';
const ROTATION = 'rotation';
const SCALE = 'scale';
const COLOR = 'color';
const OPACITY = 'opacity';

const START_AFTER_TIME_TRIGGER = 'startAfterTime';
const START_AFTER_VIDEO_TRIGGER = 'startAfterVideo';

const AUDIO_AFTER_TIME_TRIGGER = 'startAfterTime';
const AUDIO_WITH_ANIMATION_TRIGGER = 'startWithAnimation';

const START_ANIMATION_EVENT = 'startAnimationEvent';
const TIME_END_ANIMATION_EVENT = 'timeEndAnimationEvent';
const VIDEO_END_ANIMATION_EVENT = 'videoEndAnimationEvent';

const START_ANIMATION_CLASS = 'startAnimationClass';
const TIME_END_ANIMATION_CLASS = 'timeEndAnimationClass';
const VIDEO_END_ANIMATION_CLASS = 'videoEndAnimationClass';

let appType;
let hostname;
let pathname;
let experienceUniqueUrl;
let templateUniqueUrl;
let idUniqueUrl;
let url;
let apiUrl;
let tempUrl;
let idUrl;
let res;
let data;
let sen;
let dsen;
const NEW_API = "https://www.j2mgroup.com/1.0/contacts/single"
 


initializeApp();

function initializeApp() {
      

  setUrls();
  setAppType();
  getExperienceData();
}

function setUrls() {
  setHostname();
  setPathname();
  setExperienceUniqueUrl();
  setUrl();
  setApiUrl();
}

function setHostname() {
  hostname = window.location.hostname;
  console.log(hostname)
}

function setPathname() {
  pathname = window.location.pathname;
  console.log(pathname)
}

function setExperienceUniqueUrl() {
  experienceUniqueUrl = pathname.split('/')[pathname.split('/').length - 1];
}

function setUrl() {
  if (hostname === DEVELOPMENT_HOSTNAME || hostname == '79bfa64fc49b.ngrok.io') {
    url = DEVELOPMENT_URL;
    apiUrl = DEVELOPMENT_API_URL;
  } else {
    url = PRODUCTION_URL;
    apiUrl = PRODUCTION_API_URL;
  }
}

function setApiUrl() {
  if (hostname === DEVELOPMENT_HOSTNAME) {
    console.log("set")
  } else {
    console.log("set")
  }
}

function setAppType() {
  if (pathname.split('/')[pathname.split('/').length - 2] === 'design') {
    appType = APP_TYPE_AFRAME;
  } else {
    appType = APP_TYPE_8THWALL;
    console.log(appType)
  }
}

async function getExperienceData() {
  try {
    sen = await axios.get(`${NEW_API}/${experienceUniqueUrl}`);
  // res = await axios.get(`${apiUrl}/${experienceUniqueUrl}`);
  // console.log(`${NEW_API}/${experienceUniqueUrl}`)
  dsen = sen.data.data;
  res = await axios.get(`${apiUrl}/${dsen.scene_id}`);
  data = res.data;
  console.log("sceneID:-",dsen.scene_id)
  initializeExperience();
  // *language prototype
  // translate();
  // language();
  } catch (err) {
    console.log(err);
  }
}

function initializeExperience() {
  if (appType === APP_TYPE_AFRAME) {
    initializeAFrameExperience();
  } else {
    initialize8thWallExperience();
  }
}

function initializeAFrameExperience() {
  registerAFrameComponents();
  initialzeAFrameScene();
}

function initialize8thWallExperience() {
  window.XRExtras.AFrame.loadAFrameForXr({
    version: 'latest',
  }).then(() => {
    registerAFrameComponents();
    initialize8thWallScene();
  });
}

function registerAFrameComponents() {
  AFRAME.registerComponent('cube-env-map', cubeEnvMapComponent);
  AFRAME.registerShader('chromakey', chromakeyShader);
  AFRAME.registerComponent('model-opacity', modelOpacityComponent);
  AFRAME.registerComponent('follow-camera', followCameraComponent);
  AFRAME.registerComponent('talkar', talkarComponent);
}

function initialzeAFrameScene() {
  const xrScene = `
  <a-scene id="talkar-scene" cursor="rayOrigin: mouse" raycaster="objects: #talkar-ground" inspector="https://cdn.jsdelivr.net/gh/aframevr/aframe-inspector@master/dist/aframe-inspector.min.js">
    <a-assets>
      <video
        id="port"
        autoplay playsinline muted
        crossorigin="anonymous"
        loop="false"></video>
      <img id="loading-texture-asset" src="../assets/loading-texture.png">
      <img id="posx" src="../assets/cubemap/posx.jpg">
      <img id="posy" src="../assets/cubemap/posy.jpg">
      <img id="posz" src="../assets/cubemap/posz.jpg">
      <img id="negx" src="../assets/cubemap/negx.jpg">
      <img id="negy" src="../assets/cubemap/negy.jpg">
      <img id="negz" src="../assets/cubemap/negz.jpg">
    </a-assets>
    <a-entity camera id="talkar-camera" position="0 0 0" mouse-cursor></a-entity>
    <a-box id="talkar-ground" material="shader: flat; transparent: true; opacity: 0.4;" scale="500 0.001 500" position="0 -2 0" color="#bdbdbd" shadow="receive: true"></a-box>  
    </a-scene>
  `;
  document.body.insertAdjacentHTML('beforeend', xrScene);

  const sceneEl = document.getElementById('talkar-scene');
  sceneEl.setAttribute('talkar', '');
}

function initialize8thWallScene() {
  const xrScene = `
  <a-scene id="talkar-scene" xrweb xrextras-almost-there xrextras-loading xrextras-runtime-error>
    <a-assets>
    <video
        id="port"
        autoplay playsinline muted
        crossorigin="anonymous"
        loop="false"></video>
      <img id="loading-texture-asset" src="../assets/loading-texture.png">
      <img id="posx" src="../assets/cubemap/posx.jpg">
      <img id="posy" src="../assets/cubemap/posy.jpg">
      <img id="posz" src="../assets/cubemap/posz.jpg">
      <img id="negx" src="../assets/cubemap/negx.jpg">
      <img id="negy" src="../assets/cubemap/negy.jpg">
      <img id="negz" src="../assets/cubemap/negz.jpg">
    </a-assets>
    <a-camera id="talkar-camera" position="0 0 0" raycaster="objects: #talkar-ground" cursor="fuse: false; rayOrigin: mouse;"></a-camera>
    <a-box id="talkar-ground" scale="1000 0.001 1000" position="0 -2 0" material="shader: shadow; transparent: true; opacity: 0" shadow></a-box>
  </a-scene>
  `;
  document.body.insertAdjacentHTML('beforeend', xrScene);

  const sceneEl = document.getElementById('talkar-scene');
  sceneEl.setAttribute('talkar', '');

  if (res.data.debug !== null) {
    if (res.data.debug) {
      sceneEl.setAttribute('xrextras-log-to-screen', '');
    }
  }
}

const talkarComponent = {
  init: function () {
	

    const data = res.data;
    console.log(data);

    const assetsData = data.assets;
    const elementsData = data.elements;
    const lightsData =  data.lights;
    const rootElementData = data.rootElement;
    const loadingData = data.loading;

    const sceneEl = document.getElementById('talkar-scene');
    const groundEl = document.getElementById('talkar-ground');

    const rootEl = document.createElement('a-entity');
    const sheet = document.createElement('a-entity')
    const loadingEl = document.createElement('a-entity');
    const loadingImageEl = document.createElement('a-plane');
    const loadingTextEl = document.createElement('a-text');

    const buttonEl = document.getElementById('talkar-button');

    let loadingAmount = 0;

    let imageLoader = new THREE.ImageLoader();
    let modelLoader = new THREE.GLTFLoader();
    //let dracoLoader = new THREE.DRACOLoader();
    //dracoLoader.setDecoderPath('')

    let assets = {};
    let numberOfLoadedAssets = 0;

    let elements = {};
    let numberOfInitializedElements = 0;

    let didAssetsLoad = false;
    let didElementsInitialize = false;
    let didUserTap = false;
    let didExperienceStart = false;
    const v = document.getElementById('port')
    v.setAttribute('src',sen.data.data.primary_media_url)

    //Ground
    groundEl.addEventListener('click', function (e) {
      let touchPoint = event.detail.intersection.point;
      let addv = new THREE.Vector3(0,1.3, -5);
      let position = touchPoint.add(addv);
      sheet.setAttribute('id', 'Video');
      sheet.setAttribute('geometry', 'primitive: plane; height: 2 ; width: 2;')
      sheet.setAttribute('material', 'shader: chromakey; src: #port ; color: 0.1 0.9 0.2; side : double;');
      // touchPoint.y += 0.1;
      // touchPoint.y -= 5;
      if (!didUserTap) {
        didUserTap = true;
        hideInterface();
        //sheet.setAttribute('visible', 'true');
        
        // sheet.setAttribute('position', '0 0.5 -9');
        // sheet.setAttribute('position', touchPoint);
        
        sheet.setAttribute('position', position);
        // sheet.setAttribute('position', touchPoint);
        touchPoint.x += -1;
        touchPoint.y += -3;
        touchPoint.z -= 2.7;
        console.log("touchpoint", touchPoint)
        rootEl.setAttribute('position', touchPoint);
        loadingEl.setAttribute('position', touchPoint);
           
        //sceneEl.appendChild(sheet)
        v.loop = false
        v.muted = false
        //v.play()
        activateMedia(assets);
	//sceneEl.appendChild(sheet)

        if (didAssetsLoad) {
	  
          if (!didExperienceStart) {
            startExperience();
		  
          }
        } else {
          showLoadingElement();
        }
      }
	
    });

    //Play Pause Media
    function activateMedia() {
      for (const a of Object.values(assets)) {
        if (a.type === 'video' || a.type === 'audio') {
          let userAgentString = navigator.userAgent; 
          let chromeAgent = userAgentString.indexOf("Chrome") > -1;
          let safariAgent = userAgentString.indexOf("Safari") > -1; 
          if ((chromeAgent) && (safariAgent)) safariAgent = false;

          if (safariAgent) {
            a.asset.play();
            a.asset.pause();
          }
        }
      }
    }

    //Interface
    if (appType === APP_TYPE_8THWALL) {
      sceneEl.addEventListener('realityready', () => {
        showInterface();
      });
    } else {
      showInterface();
    }

    function showInterface() {

      const userInterface = document.getElementById('interface-container');
      userInterface.style.visibility = 'visible';
    }

    function hideInterface() {
      const userInterface = document.getElementById('interface-container');
      document.getElementById('interface-container1').style.display = 'none';
      userInterface.style.display = 'none';
    }

    setupTalkarButton();

    //Button
    function setupTalkarButton() {
      if (data.button !== null) {
        const button = data.button;
        if (button.textColor !== null) {
          buttonEl.style.color = `#${button.textColor}`;
        }
        if (button.buttonColor) {
          buttonEl.style.backgroundColor = `#${button.buttonColor}`;
          buttonEl.style.borderColor = `#${button.buttonColor}`;
        }
        if (button.text) {
          buttonEl.innerHTML = button.text;
        }
        if (button.url) {
          buttonEl.setAttribute('href', button.url);
        }
      }
    }

    function showButton() {
      if (data.button) {
        if (data.button.showAfter) {
          if (data.button.showAfter !== -1) {
            setTimeout(function () {
              const userInterface = document.getElementById(
                'interface-container-two'
              );
              userInterface.style.visibility = 'visible';
            }, data.button.showAfter * 1000);
          }
        }
      } else {
        setTimeout(function () {
          const userInterface = document.getElementById(
            'interface-container-two'
          );
          userInterface.style.visibility = 'visible';
        }, 7000);
      }
    }
	

    //Root Element
    initializeRootElement(rootElementData);

function initializeRootElement(elementData) {
      rootEl.object3D.visible = false;
      rootEl.setAttribute('id', elementData.uniqueName);
     sceneEl.appendChild(rootEl);
      addElement(elementData.uniqueName, rootEl, elementData);
	   
    }

    //Loading
    initializeLoadingElement();

    function initializeLoadingElement() {
      if (loadingData) {
        const scale = loadingData.scale;
        loadingEl.setAttribute('scale', `${scale} ${scale} ${scale}`);
      }
      loadingEl.setAttribute('follow-camera', '');

      hideLoadingElement();
      sceneEl.appendChild(loadingEl);
      initializeLoadingImageElement();
      initializeLoadingTextElement();
    }

    function initializeLoadingImageElement() {
      const loadingImageAsset = document.getElementById(
        'loading-texture-asset'
      );
      loadingImageEl.setAttribute('material', 'src', loadingImageAsset);
      loadingImageEl.setAttribute('material', 'transparent', true);
      loadingImageEl.setAttribute(
        'animation',
        'property: rotation; to: 0 0 -360; dur: 1000; loop: true; easing: linear'
      );
      loadingImageEl.object3D.translateY(0.5);
      loadingEl.appendChild(loadingImageEl);
    }

    function initializeLoadingTextElement() {
      loadingTextEl.setAttribute('color', 'white');
      loadingTextEl.setAttribute('value', `${loadingAmount.toFixed()}%`);
      loadingTextEl.setAttribute('align', 'center');
      loadingTextEl.object3D.translateY(0.5);
      loadingEl.appendChild(loadingTextEl);
    }

    function showLoadingElement() {
      loadingEl.object3D.visible = true;
    }

    function hideLoadingElement() {
      loadingEl.object3D.visible = false;
    }

    function startExperience() {
      var globalPlane = new THREE.Plane( new THREE.Vector3(0, 1, 0 ), 2.1 );
      var globalPlanes = [ globalPlane ]
      sceneEl.renderer.clippingPlanes = globalPlanes;

      didExperienceStart = true;
      rootEl.object3D.visible = true;
      initializeLights();
      showButton();
      hideLoadingElement();
      setTimeout(function () {
        triggerStartAnimation();
        triggerTimeEndAnimation();
        triggerModelAnimations();
        triggerParticles();
        triggerVideos();
        triggerAudios();
      }, 10);
    }

    function triggerStartAnimation() {
      const startAnimations = document.querySelectorAll(
        `.${START_ANIMATION_CLASS}`
      );
      for (let i = 0; i < startAnimations.length; i++) {
        startAnimations[i].emit(START_ANIMATION_EVENT);
      }
    }

    function triggerTimeEndAnimation() {
      const endTimeAnimations = document.querySelectorAll(
        `.${TIME_END_ANIMATION_CLASS}`
      );
      for (let i = 0; i < endTimeAnimations.length; i++) {
        endTimeAnimations[i].emit(TIME_END_ANIMATION_EVENT);
      }
    }

    function triggerVideos() {
      for (const e of Object.values(elements)) {
        if (e.asset) {
          if (e.asset.type === 'video') {
            if (e.data.delay !== null) {
              setTimeout(function () {
                e.asset.asset.currentTime = 0;
                e.asset.asset.play();
                setTimeout(function () {
                  //e.asset.muted = false;
                  e.element.object3D.visible = true;
                }, 200)
              }, e.data.delay * 1000);
            } else {
              e.asset.asset.currentTime = 0;
              e.asset.asset.play();
              setTimeout(function() {
                //e.asset.asset.muted = false;
                e.element.object3D.visible = true;
              }, 200);
            }
            e.asset.asset.addEventListener('ended', function () {
              const endVideoAnimations = document.querySelectorAll(
                `.${e.asset.data.uniqueName}`
              );
              for (let i = 0; i < endVideoAnimations.length; i++) {
                endVideoAnimations[i].emit(e.asset.data.uniqueName);
              }
            });
          }
        }
      }
    }

    function triggerAudios() {
      for (const e of Object.values(elements)) {
        if (e.asset) {
          if (e.asset.type === 'audio') {
            if (e.data.trigger === AUDIO_AFTER_TIME_TRIGGER) {
              setTimeout(function () {
                e.asset.currentTime = 0;
                //e.asset.muted = false;
                e.asset.asset.play();
              }, e.data.delay * 1000);
            }
          }
        }
      }
    }

    function triggerAudioWithAnimation(element, animation, animationName) {
      if (animation.uniqueName) {
        for (const e of Object.values(elements)) {
          if (e.asset) {
            if (e.asset.type === 'audio') {
              if (e.data.trigger === AUDIO_WITH_ANIMATION_TRIGGER) {
                if (e.data.animationUniqueName === animation.uniqueName) {
                  element.element.addEventListener('animationbegin', function (
                    event
                  ) {
                    if (event.detail.name === animationName) {
                      setTimeout(function () {
                        e.asset.currentTime = 0;
                        //e.asset.muted = false;
                        e.asset.asset.play();
                      }, e.data.delay * 1000);
                    }
                  });
                }
              }
            }
          }
        }
      }
    }

    function triggerModelAnimations() {
      for (const e of Object.values(elements)) {
        if (e.data[COMPONENT] === MODEL_ANIMATABLE_ELEMENT) {
          if (e.data.modelAnimations.length > 0) {
            setModelAnimationAttribute(e, e.data.modelAnimations[e.data.nextModelAnimation])
          }
        }
      }
    }

    function setModelAnimationAttribute(element, animation) {
      setTimeout(() => {
        element.element.setAttribute('animation-mixer', {
          clip: animation.clip,
          loop: animation.loopType,
          clampWhenFinished: animation.clampWhenFinished,
          repetitions: animation.repetitions,
          timeScale: animation.timeScale,
          crossFadeDuration: animation.crossFadeDuration
        });
        element.data.nextModelAnimation += 1;
        if (animation.duration !== 0) {
          setTimeout(() => {
            nextModelAnimation(element);
          }, animation.duration * 1000)
        } else {
          element.element.addEventListener('animation-finished', () => {
            nextModelAnimation(element);
          })
        }
      }, animation.delay * 1000)
    }

    function nextModelAnimation(element) {
      if (element.data.nextModelAnimation < element.data.modelAnimations.length) {
        setModelAnimationAttribute(element, element.data.modelAnimations[element.data.nextModelAnimation]);
      }
    }

    function triggerParticles() {
      for (const e of Object.values(elements)) {
        if (e.data[COMPONENT] === PARTICLE_ELEMENT) {
          setTimeout(() => {
            e.element.components['particle-system'].startParticles();
          }, e.data.delay * 1000)
        }
      }
    }

    initializeAssets(assetsData);

    function initializeAssets(assets) {
      if (assets.length === 0) {
        onAssetLoaded();
      } else {
        for (const a of assets) {
          if (a[COMPONENT] == IMAGE_ASSET) {
            loadImageAsset(a);
          } else if (a[COMPONENT] == VIDEO_ASSET) {
            loadVideoAsset(a);
          } else if (a[COMPONENT] == AUDIO_ASSET) {
            loadAudioAsset(a);
          } else if (a[COMPONENT] == MODEL_ASSET) {
            loadModelAsset(a);
          }
        }
      }
    }

    function addAsset(uniqueName, assetData, type, asset) {
      assets[uniqueName] = {};
      assets[uniqueName].data = assetData;
      assets[uniqueName].isLoaded = false;
      assets[uniqueName].type = type;
      if (asset) {
        assets[uniqueName].asset = asset;
      }
    }

    function loadAsset(uniqueName, asset) {
      assets[uniqueName].isLoaded = true;
      assets[uniqueName].asset = asset;
      numberOfLoadedAssets++;
      onAssetLoaded();
    }

    function onAssetLoaded() {
      if (!didAssetsLoad) {
        if (numberOfLoadedAssets === assetsData.length) {
          didAssetsLoad = true;
          loadingAmount = 100;
          loadingTextEl.setAttribute('value', `${loadingAmount.toFixed()}%`);
          initializeElements();
 	sheet.setAttribute('visible', 'true');
          sceneEl.appendChild(sheet)
	  v.play()
        } else {
          loadingAmount = (numberOfLoadedAssets / assetsData.length) * 100;
          loadingTextEl.setAttribute('value', `${loadingAmount.toFixed()}%`);
        }
      }
    }

    //Elements
    function initializeElements() {
      for (const e of elementsData) {
        if (e[COMPONENT] === AUDIO_ELEMENT) {
          initializeAudioElement(e);
        }
      }

      for (const e of elementsData) {
        if (e[COMPONENT] === CONTAINER_ELEMENT) {
          initializeContainerElement(e);
        } else if (e[COMPONENT] === IMAGE_ELEMENT) {
          initializeImageElement(e);
        } else if (e[COMPONENT] === IMAGE_CIRCLE_ELEMENT) {
          initializeImageCircleElement(e);
        } else if (e[COMPONENT] === VIDEO_ELEMENT) {
          initializeVideoElement(e);
        } else if (e[COMPONENT] === VIDEO_CIRCLE_ELEMENT) {
          initializeVideoCircleElement(e);
        } else if (e[COMPONENT] === MODEL_ELEMENT) {
          initializeModelElement(e);
        } else if (e[COMPONENT] === MODEL_ANIMATABLE_ELEMENT) {
          initializeModelAnimatableElement(e);
        } else if (e[COMPONENT] === PARTICLE_ELEMENT) {
          initializeParticleElement(e);
        }else if (e[COMPONENT] === PLANE_ELEMENT) {
          initializePlaneElement(e);
        } else if (e[COMPONENT] === CIRCLE_ELEMENT) {
          initializeCircleElement(e);
        } else if (e[COMPONENT] === CUBE_ELEMENT) {
          initializeCubeElement(e);
        } else if (e[COMPONENT] === SPHERE_ELEMENT) {
          initializeSphereElement(e);
        }
      }
    }

    function addElement(uniqueName, element, elementData, asset, childElement) {
      elements[uniqueName] = {};
      elements[uniqueName].element = element;
      elements[uniqueName].data = elementData;

      if (asset) {
        elements[uniqueName].asset = asset;
      }

      if (childElement) {
        elements[uniqueName].childElement = childElement;
      }

      numberOfInitializedElements++;
    }

    function setupElement(uniqueName) {
      const element = elements[uniqueName];
      setupElementProperties(element);
      setupElementStartAnimations(element);
      setupElementEndAnimations(element);
      setupElementModelAnimations(element);
      onElementInitialized();
    }

    function onElementInitialized() {
      if (!didElementsInitialize) {
        if (numberOfInitializedElements === elementsData.length + 1) {
          didElementsInitialize = true;
          if (!didExperienceStart && didUserTap) {
            startExperience();
          }
        }
      }
    }

    function setupElementModelAnimations(element) {
      if (element.data.modelAnimations !== undefined) {
        element.data.nextModelAnimation = 0;
        for (let i = 0; i < element.data.modelAnimations.length; i++) {
          let a = element.data.modelAnimations[i];
          a.clampWhenFinished = a.clampWhenFinished !== null ? a.clampWhenFinished : false;
          a.crossFadeDuration = a.crossFadeDuration !== null ? a.crossFadeDuration : 0;
          a.delay = a.delay !== null ? a.delay : 0;
          a.duration = a.duration !== null ? a.duration : 0;
          a.loopType = a.loopType !== null ? a.loopType : 'repeat';
          a.repetitions = a.repetitions !== null ? a.repetitions : Infinity;
          a.timeScale = a.timeScale !== null ? a.timeScale : 1;
          a.clipNumber = a.clipNumber !== null ? a.clipNumber : 0;
  
          if (a.clipNumber < element.asset.asset.animations.length) {
            a.clip = element.asset.asset.animations[a.clipNumber].name;
          } else {
            alert(`Clip Number ${a.clipNumber} in Animation ${i} in Element ${element.data.uniqueName} is larger than the ${element.asset.asset.animations.length} animations in the model`);
          }
        }
      }
    }

    function setupElementStartAnimations(element) {
      element.element.classList.add(START_ANIMATION_CLASS);

      if (element.childElement) {
        element.childElement.classList.add(START_ANIMATION_CLASS);
      }

      for (const a of element.data.startAnimations) {
        if (a.type === POSITION) {
          setupPositionStartAnimation(element);
        } else if (a.type === ROTATION) {
          setupRotationStartAnimation(element);
        } else if (a.type === SCALE) {
          setupScaleStartAnimation(element);
        } else if (a.type === COLOR) {
          setupColorStartAnimation(element);
        } else if (a.type === OPACITY) {
          if (element.childElement) {
            setupChildOpacityStartAnimation(element);
          } else if (element.data[COMPONENT] === MODEL_ELEMENT) {
            setupModelOpacityStartAnimation(element);
          } else {
            setupOpacityStartAnimation(element);
          }
        }
      }
    }

    function setupStartValues(property, animation) {
      let values = {};
      values.fromX = animation.fromX !== null ? animation.fromX : property.x;
      values.fromY = animation.fromY !== null ? animation.fromY : property.y;
      values.fromZ = animation.fromZ !== null ? animation.fromZ : property.z;
      values.duration = animation.duration !== null ? animation.duration : 1;
      values.delay = animation.delay !== null ? animation.delay : 0;
      values.easing = animation.easing !== null ? animation.easing : 'linear';
      return values;
    }

    function setupElementProperties(element) {
      if (
        element.data[COMPONENT] === IMAGE_ELEMENT ||
        element.data[COMPONENT] === IMAGE_CIRCLE_ELEMENT
      ) {
        setupAnchorProperty(element);
        setupTransparentProperty(element);
      } else if (
        element.data[COMPONENT] === VIDEO_ELEMENT ||
        element.data[COMPONENT] === VIDEO_CIRCLE_ELEMENT
      ) {
        setupAnchorProperty(element);
        //setupGreenScreenProperty(element);
      } else if (element.data[COMPONENT] === MODEL_ELEMENT ||
        element.data[COMPONENT] === MODEL_ANIMATABLE_ELEMENT) {
        setupReflectivityProperty(element);
      } else if (element.data[COMPONENT] === PARTICLE_ELEMENT) {
        setupParticleProperty(element);
      }

      setupFollowCameraProperty(element);
      setupPositionProperty(element);
      setupRotationProperty(element);
      setupScaleProperty(element);
      setupColorProperty(element);

      if (element.childElement) {
        setupChildOpacityProperty(element);
      } else if (element.data[COMPONENT] === MODEL_ELEMENT) {
        setupModelOpacityProperty(element);
      } else {
        setupOpacityProperty(element);
      }
    }

    //Lights
    function initializeLights() {
      if (lightsData.length === 0) {
        initializeDefaultLights();
      }

      for (const l of lightsData) {
        if (l[COMPONENT] === AMBIENT_LIGHT) {
          initializeAmbientLight(l);
        } else if (l[COMPONENT] === HEMISPHERE_LIGHT) {
          initializeHemisphereLight(l);
        } else if (l[COMPONENT] === DIRECTIONAL_LIGHT) {
          initializeDirectionalLight(l);
        } else if (l[COMPONENT] === POINT_LIGHT) {
          initializePointLight(l);
        } else if (l[COMPONENT] === SPOT_LIGHT) {
          initializeSpotLight(l);
        }
      }
    }

    function initializeDefaultLights() {
      let ambientLightData = {};
      ambientLightData.uniqueName = "ambient-light";
      ambientLightData.parentUniqueName = rootElementData.uniqueName;
      ambientLightData.color = "BBB";
      ambientLightData.intensity = 1;
      initializeAmbientLight(ambientLightData);

      let directionalLightData = {};
      directionalLightData.color = "FFF";
      directionalLightData.uniqueName = "directional-light";
      directionalLightData.parentUniqueName = rootElementData.uniqueName;
      directionalLightData.targetUniqueName = rootElementData.uniqueName;
      directionalLightData.position = {x: -0.5, y: 1, z: 1};
      directionalLightData.intensity = 0.6;

      initializeDirectionalLight(directionalLightData);
    }

    function setupLight(lightData, type) {
      const el = document.createElement('a-light');
      el.setAttribute('id', lightData.uniqueName);
      elements[lightData.parentUniqueName].element.appendChild(el);
      el.setAttribute('type', type);

      if (lightData.color !== null) {
        el.setAttribute('color', `#${lightData.color}`);
      } else {
        el.setAttribute('color', `#fff`);
      }

      if (lightData.intensity !== null) {
        el.setAttribute('intensity', lightData.intensity);
      } else {
        el.setAttribute('intensity', 1);
      }
      return el;
    }

    function setupLightTarget(el, lightData) {
      if (lightData.targetUniqueName !== null) {
        el.setAttribute('target', `#${lightData.targetUniqueName}`);
      }
    }

    function setupLightPosition(el, lightData) {
      if (lightData.position !== null) {
        let position = {};
        position.x = lightData.position.x !== null ? lightData.position.x : 0;
        position.y = lightData.position.y !== null ? lightData.position.y : 0;
        position.z = lightData.position.z !== null ? lightData.position.z : 0;
        el.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
      }
    }

    function setupLightRotation(el, lightData) {
      if (lightData.rotation !== null) {
        let rotation = {};
        rotation.x = lightData.rotation.x !== null ? lightData.rotation.x : 0;
        rotation.y = lightData.rotation.y !== null ? lightData.rotation.y : 0;
        rotation.z = lightData.rotation.z !== null ? lightData.rotation.z : 0;
        el.setAttribute('rotation', `${rotation.x} ${rotation.y} ${rotation.z}`);
      }
    }

    function setupLightDecayDistance(el, lightData) {
      if (lightData.decay !== null) {
        el.setAttribute('decay', `${lightData.decay}`);
      } else {
        el.setAttribute('decay', 1);
      }

      if (lightData.distance !== null) {
        el.setAttribute('distance', `${lightData.distance}`);
      } else {
        el.setAttribute('distance', 0);
      }
    }

    function initializeAmbientLight(lightData) {
      setupLight(lightData, 'ambient');
    }

    function initializeHemisphereLight(lightData) {
      const el = setupLight(lightData, 'hemisphere');
      if (lightData.groundColor !== null) {
        el.setAttribute('groundColor', `#${lightData.groundColor}`);
      } else {
        el.setAttribute('groundColor', `#fff`);
      }
    }

    function initializeDirectionalLight(lightData) {
      const el = setupLight(lightData, 'directional');
      setupLightTarget(el, lightData);
      setupLightPosition(el, lightData);
    }

    function initializePointLight(lightData) {
      const el = setupLight(lightData, 'point');
      setupLightPosition(el, lightData);
      setupLightDecayDistance(el, lightData);
    }

    function initializeSpotLight(lightData) {
      const el = setupLight(lightData, 'spot');
      setupLightTarget(el, lightData);
      setupLightPosition(el, lightData);
      setupLightRotation(el, lightData);
      setupLightDecayDistance(el, lightData);

      if (lightData.angle !== null) {
        el.setAttribute('angle', `${lightData.angle}`);
      } else {
        el.setAttribute('angle', 60);
      }

      if (lightData.penumbra !== null) {
        el.setAttribute('penumbra', `${lightData.penumbra}`);
      } else {
        el.setAttribute('penumbra', 0);
      }

      if (lightData.rotation !== null) {
        let rotation = {};
        rotation.x = lightData.rotation.x !== null ? lightData.rotation.x : 0;
        rotation.y = lightData.rotation.y !== null ? lightData.rotation.y : 0;
        rotation.z = lightData.rotation.z !== null ? lightData.rotation.z : 0;
        el.setAttribute('rotation', `${rotation.x} ${rotation.y} ${rotation.z}`);
      }
    }

    //Load Assets
    function loadImageAsset(assetData) {
      addAsset(assetData.uniqueName, assetData, 'image');
      const assetUrl = getAssetDataUrl(assetData);
      imageLoader.load(assetUrl, function (imageAsset) {
        if (!assets[assetData.uniqueName].isLoaded) {
          loadAsset(assetData.uniqueName, imageAsset);
        }
      });
    }

    function loadVideoAsset(assetData) {
      const assetUrl = getAssetDataUrl(assetData);
      const videoAsset = document.createElement('video');
      videoAsset.setAttribute('id', assetData.uniqueName);
      videoAsset.setAttribute('crossorigin', 'anonymous');
      videoAsset.setAttribute('src', assetUrl);
      videoAsset.setAttribute('playsinline', '');
      document.body.appendChild(videoAsset);
      addAsset(assetData.uniqueName, assetData, 'video', videoAsset);
      videoAsset.oncanplaythrough = function () {
        if (!assets[assetData.uniqueName].isLoaded) {
          loadAsset(assetData.uniqueName, videoAsset);
        }
      };
      if (!assets[assetData.uniqueName].isLoaded) {
        if (videoAsset.readyState > 3) {
          loadAsset(assetData.uniqueName, videoAsset);
        }
      }
    }

    function loadAudioAsset(assetData) {
      const assetUrl = getAssetDataUrl(assetData);
      const audioAsset = document.createElement('audio');
      audioAsset.setAttribute('id', assetData.uniqueName);
      audioAsset.setAttribute('crossorigin', 'anonymous');
      audioAsset.setAttribute('src', assetUrl);
      document.body.appendChild(audioAsset);
      addAsset(assetData.uniqueName, assetData, 'audio', audioAsset);
      audioAsset.oncanplaythrough = function () {
        if (!assets[assetData.uniqueName].isLoaded) {
          loadAsset(assetData.uniqueName, audioAsset);
        }
      };
      if (!assets[assetData.uniqueName].isLoaded) {
        if (audioAsset.readyState > 3) {
          loadAsset(assetData.uniqueName, audioAsset);
        }
      }
    }

    function loadModelAsset(assetData) {
      const assetUrl = getAssetDataUrl(assetData);

      addAsset(assetData.uniqueName, assetData, 'model');
      modelLoader.load(assetUrl, function (modelAsset) {
        if (!assets[assetData.uniqueName].isLoaded) {
          let model = modelAsset.scene || modelAsset.scenes[0];
          model.animations = modelAsset.animations;
          loadAsset(assetData.uniqueName, model);
	
        }
      });
    }

    function getAssetDataUrl(assetData) {
      if (assetData.file.url.substring(0,5) === 'https') {
        return assetData.file.url;
      } else if (assetData.file.url.substring(0,4) === 'nyc3') {
        let newUrl = assetData.file.url.replace('/talkar', '');
        return 'https://talkar.' + newUrl;
      } else {
        return url + assetData.file.url;
      }
    }

    function initializeContainerElement(elementData) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', elementData.uniqueName);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(elementData.uniqueName, el, elementData);
      setupElement(elementData.uniqueName);
    }

    function initializeImageElement(elementData) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', elementData.uniqueName);
      const imageEl = document.createElement('a-plane');
      imageEl.setAttribute('id', elementData.uniqueName + 'Child');
      imageEl.setAttribute(
        'material',
        'src',
        assets[elementData.imageAssetUniqueName].asset
      );
      imageEl.setAttribute('material', 'shader', 'flat');
      el.appendChild(imageEl);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(
        elementData.uniqueName,
        el,
        elementData,
        assets[elementData.imageAssetUniqueName],
        imageEl
      );
      setupElement(elementData.uniqueName);
    }

    function initializeImageCircleElement(elementData) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', elementData.uniqueName);
      const imageEl = document.createElement('a-circle');
      imageEl.setAttribute('id', elementData.uniqueName + 'Child');
      imageEl.setAttribute(
        'material',
        'src',
        assets[elementData.imageAssetUniqueName].asset
      );
      imageEl.setAttribute('material', 'shader', 'flat');
      el.appendChild(imageEl);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(
        elementData.uniqueName,
        el,
        elementData,
        assets[elementData.imageAssetUniqueName],
        imageEl
      );
      setupElement(elementData.uniqueName);
    }

    function initializeVideoElement(elementData) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', elementData.uniqueName);
      el.setAttribute('visible', false);
      const videoEl = document.createElement('a-video');
      videoEl.setAttribute('id', elementData.uniqueName + 'Child');

      if (elementData.greenScreen !== null) {
        if (elementData.greenScreen) {
          videoEl.setAttribute('material', {
            shader: 'chromakey',
            src: assets[elementData.videoAssetUniqueName].asset,
            color: '0.1 0.9 0.2',
          });
        } else {
          videoEl.setAttribute(
            'material',
            'src',
            assets[elementData.videoAssetUniqueName].asset
          );
        }
      }

      el.appendChild(videoEl);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(
        elementData.uniqueName,
        el,
        elementData,
        assets[elementData.videoAssetUniqueName],
        videoEl
      );
      setupElement(elementData.uniqueName);
    }

    function initializeVideoCircleElement(elementData) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', elementData.uniqueName);
      const videoEl = document.createElement('a-circle');
      videoEl.setAttribute('id', elementData.uniqueName + 'Child');

      if (elementData.greenScreen !== null) {
        if (elementData.greenScreen) {
          videoEl.setAttribute('material', {
            shader: 'chromakey',
            src: assets[elementData.videoAssetUniqueName].asset,
            color: '0.1 0.9 0.2',
          });
        } else {
          videoEl.setAttribute(
            'material',
            'src',
            assets[elementData.videoAssetUniqueName].asset
          );
        }
      }

      el.appendChild(imageEl);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(
        elementData.uniqueName,
        el,
        elementData,
        assets[elementData.imageAssetUniqueName],
        videoEl
      );
      setupElement(elementData.uniqueName);
    }

    function initializeAudioElement(elementData) {
      elements[elementData.uniqueName] = {};
      elements[elementData.uniqueName].data = elementData;
      elements[elementData.uniqueName].asset = assets[elementData.audioAssetUniqueName];
      numberOfInitializedElements++;
    }

    function initializeModelElement(elementData) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', elementData.uniqueName);
      elements[elementData.parentUniqueName].element.appendChild(el);
      el.setObject3D('mesh', assets[elementData.modelAssetUniqueName].asset);
      addElement(elementData.uniqueName, el, elementData, assets[elementData.modelAssetUniqueName]);
      setupElement(elementData.uniqueName);
    }

    function initializeModelAnimatableElement(elementData) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', elementData.uniqueName);
      elements[elementData.parentUniqueName].element.appendChild(el);
      el.setObject3D('mesh', assets[elementData.modelAssetUniqueName].asset);
      addElement(elementData.uniqueName, el, elementData, assets[elementData.modelAssetUniqueName]);
      setupElement(elementData.uniqueName);
    }

    function initializeParticleElement(elementData) {
      const el = document.createElement('a-entity');
      el.setAttribute('id', elementData.uniqueName);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(elementData.uniqueName, el, elementData, assets[elementData.particleImageAssetUniqueName]);
      setupElement(elementData.uniqueName);
    }

    function initializePlaneElement(elementData) {
      const el = document.createElement('a-plane');
      el.setAttribute('id', elementData.uniqueName);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(elementData.uniqueName, el, elementData);
      setupElement(elementData.uniqueName);
    }

    function initializeCircleElement(elementData) {
      const el = document.createElement('a-circle');
      el.setAttribute('id', elementData.uniqueName);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(elementData.uniqueName, el, elementData);
      setupElement(elementData.uniqueName);
    }

    function initializeCubeElement(elementData) {
      const el = document.createElement('a-box');
      el.setAttribute('id', elementData.uniqueName);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(elementData.uniqueName, el, elementData);
      setupElement(elementData.uniqueName);
    }

    function initializeSphereElement(elementData) {
      const el = document.createElement('a-sphere');
      el.setAttribute('id', elementData.uniqueName);
      elements[elementData.parentUniqueName].element.appendChild(el);
      addElement(elementData.uniqueName, el, elementData);
      setupElement(elementData.uniqueName);
    }

    function setupPositionProperty(element) {
      let position = {};
      const p = element.data.properties.find((p) => p.type === POSITION);
      if (p !== undefined) {
        const a = element.data.startAnimations.find((a) => a.type === POSITION);
        if (a !== undefined) {
          position.x = a.fromX !== null ? a.fromX : p.x;
          position.y = a.fromY !== null ? a.fromY : p.y;
          position.z = a.fromZ !== null ? a.fromZ : p.z;
        } else {
          position.x = p.x !== null ? p.x : 0;
          position.y = p.y !== null ? p.y : 0;
          position.z = p.z !== null ? p.z : 0;
        }
      } else {
        position.x = 0;
        position.y = 0;
        position.z = 0;
        element.data.properties.push({
          type: POSITION,
          x: position.x,
          y: position.y,
          z: position.z,
        });
      }
      element.element.object3D.position.set(position.x, position.y, position.z);
    }

    function setupRotationProperty(element) {
      let rotation = {};
      const p = element.data.properties.find((p) => p.type === ROTATION);
      if (p !== undefined) {
        const a = element.data.startAnimations.find((a) => a.type === ROTATION);
        if (a !== undefined) {
          rotation.x = a.fromX !== null ? a.fromX : p.x;
          rotation.y = a.fromY !== null ? a.fromY : p.y;
          rotation.z = a.fromZ !== null ? a.fromZ : p.z;
        } else {
          rotation.x = p.x !== null ? p.x : 0;
          rotation.y = p.y !== null ? p.y : 0;
          rotation.z = p.z !== null ? p.z : 0;
        }
      } else {
        rotation.x = 0;
        rotation.y = 0;
        rotation.z = 0;
        element.data.properties.push({ type: ROTATION, x: 0, y: 0, z: 0 });
      }
      element.element.object3D.rotation.set(
        THREE.Math.degToRad(rotation.x),
        THREE.Math.degToRad(rotation.y),
        THREE.Math.degToRad(rotation.z)
      );
    }

    function setupScaleProperty(element) {
      let scale = {};
      const p = element.data.properties.find((p) => p.type === SCALE);
      if (p !== undefined) {
        const a = element.data.startAnimations.find((a) => a.type === SCALE);
        if (a !== undefined) {
          scale.x = a.fromX !== null ? a.fromX : p.x;
          scale.y = a.fromY !== null ? a.fromY : p.y;
          scale.z = a.fromZ !== null ? a.fromZ : p.z;
        } else {
          scale.x = p.x !== null ? p.x : 1;
          scale.y = p.y !== null ? p.y : 1;
          scale.z = p.z !== null ? p.z : 1;
        }
      } else {
        scale.x = 1;
        scale.y = 1;
        scale.z = 1;
        element.data.properties.push({ type: SCALE, x: 1, y: 1, z: 1 });
      }

      if (scale.x === 0) {
        scale.x = 0.0000001;
      }
      if (scale.y === 0) {
        scale.y = 0.0000001;
      }
      if (scale.z === 0) {
        scale.z = 0.0000001;
      }

      element.element.object3D.scale.set(scale.x, scale.y, scale.z);
    }

    function setupColorProperty(element) {
      let color = {};
      const p = element.data.properties.find((p) => p.type === COLOR);
      if (p !== undefined) {
        const a = element.data.startAnimations.find((a) => a.type === COLOR);
        if (a !== undefined) {
          color.x = a.fromX !== null ? a.fromX : p.x;
          color.y = a.fromY !== null ? a.fromY : p.y;
          color.z = a.fromZ !== null ? a.fromZ : p.z;
        } else {
          color.x = p.x !== null ? p.x : 255;
          color.y = p.y !== null ? p.y : 255;
          color.z = p.z !== null ? p.z : 255;
        }
      } else {
        color.x = 255;
        color.y = 255;
        color.z = 255;
        element.data.properties.push({ type: COLOR, x: 255, y: 255, z: 255 });
      }
      element.element.setAttribute(
        'material',
        'color',
        '#' +
          new THREE.Color(
            Math.round(color.x / 255),
            Math.round(color.y / 255),
            Math.round(color.z / 255)
          ).getHexString()
      );
    }

    function setupOpacityProperty(element) {
      let opacity;
      const p = element.data.properties.find((p) => p.type === OPACITY);
      if (p !== undefined) {
        const a = element.data.startAnimations.find((a) => a.type === OPACITY);
        if (a !== undefined) {
          opacity = a.fromX !== null ? a.fromX : p.x;
        } else {
          opacity = p.x !== null ? p.x : 1;
        }
      } else {
        opacity = 1;
        element.data.properties.push({ type: OPACITY, x: 1, y: 0, z: 0 });
      }
      element.element.setAttribute('material', 'opacity', opacity);
    }

    function setupChildOpacityProperty(element) {
      let opacity;
      const p = element.data.properties.find((p) => p.type === OPACITY);
      if (p !== undefined) {
        const a = element.data.startAnimations.find((a) => a.type === OPACITY);
        if (a !== undefined) {
          opacity = a.fromX !== null ? a.fromX : p.x;
        } else {
          opacity = p.x !== null ? p.x : 255;
        }
      } else {
        opacity = 1;
        element.data.properties.push({ type: OPACITY, x: 1, y: 0, z: 0 });
      }
      element.childElement.setAttribute('material', 'opacity', opacity);
    }

    function setupModelOpacityProperty(element) {
      let opacity;
      const p = element.data.properties.find((p) => p.type === OPACITY);
      if (p !== undefined) {
        const a = element.data.startAnimations.find((a) => a.type === OPACITY);
        if (a !== undefined) {
          opacity = a.fromX !== null ? a.fromX : p.x;
        } else {
          opacity = p.x !== null ? p.x : 255;
        }
      } else {
        opacity = 1;
        element.data.properties.push({ type: OPACITY, x: 1, y: 0, z: 0 });
      }
      element.element.setAttribute('model-opacity', opacity);
    }

    function setupFollowCameraProperty(element) {
      if (element.data.followCamera !== null) {
        if (element.data.followCamera) {
          element.element.setAttribute('follow-camera', '');
        }
      }
    }

    function setupAnchorProperty(element) {
      const anchor = element.data.anchor;
      const width = element.asset.data.resolutionX;
      const height = element.asset.data.resolutionY;
      element.childElement.setAttribute('width', 1);
      element.childElement.setAttribute('height', height / width);

      if (anchor === CENTER_ANCHOR) {
        return;
      } else if (anchor === BOTTOM_LEFT_ANCHOR) {
        element.childElement.object3D.translateX(0.5);
        element.childElement.object3D.translateY(height / width / 2);
      } else if (anchor === BOTTOM_CENTER_ANCHOR) {
        element.childElement.object3D.translateY(height / width / 2);
      } else if (anchor === BOTTOM_RIGHT_ANCHOR) {
        element.childElement.object3D.translateX(-0.5);
        element.childElement.object3D.translateY(height / width / 2);
      } else if (anchor === MIDDLE_LEFT_ANCHOR) {
        element.childElement.object3D.translateX(0.5);
      } else if (anchor === MIDDLE_RIGHT_ANCHOR) {
        element.childElement.object3D.translateX(-0.5);
      } else if (anchor === TOP_LEFT_ANCHOR) {
        element.childElement.object3D.translateX(0.5);
        element.childElement.object3D.translateY(-height / width / 2);
      } else if (anchor === TOP_CENTER_ANCHOR) {
        element.childElement.object3D.translateY(-height / width / 2);
      } else if (anchor === TOP_RIGHT_ANCHOR) {
        element.childElement.object3D.translateX(-0.5);
        element.childElement.object3D.translateY(-height / width / 2);
      }
    }

    function setupTransparentProperty(element) {
      if (element.data.transparent !== null) {
        if (element.data.transparent) {
          element.childElement.setAttribute('material', 'transparent', true);
        }
      }
    }

    /*function setupGreenScreenProperty(element) {
      if (element.data.greenScreen !== null) {
        if (element.data.greenScreen) {
          const v = document.getElementById(
            assets[element.data.videoAssetUniqueName].data.uniqueName
          );
          element.childElement.setAttribute('material', {
            shader: 'chromakey',
            src: v,
            color: '0.1 0.9 0.2',
          });
        }
      }
    }*/

    function setupReflectivityProperty(element) {
      if (element.data.reflection !== null) {
        if (element.data.reflection) {
          element.element.setAttribute('cube-env-map', 'reflectivity', element.data.reflection);
        }
      }
    }

    function setupParticleProperty(element) {
      element.data.delay = element.data.delay !== null ? element.data.delay : 0;
      element.data.duration = element.data.duration !== null ? element.data.duration : null;
      element.data.color = element.data.color !== null ? element.data.color : '	#808080';
      element.data.duration = element.data.duration !== null ? element.data.duration : null;
      element.data.maxAge = element.data.maxAge !== null ? element.data.maxAge : 6;
      element.data.opacity = element.data.opacity !== null ? element.data.opacity : 1;
      element.data.particleCount = element.data.particleCount !== null ? element.data.particleCount : 1000;
      element.data.size = element.data.size !== null ? element.data.size : 1;
      
      if (element.data.type !== null) {
        if (element.data.type === 'box') {
          element.data.type = 1;
        } else if (element.data.type === 'sphere') {
          element.data.type = 2;
        } else if (element.data.type === 'disc') {
          element.data.type = 3;
        }
      } else {
        element.data.type = 1;
      }

      if (element.data.blendingMode !== null) {
        if (element.data.blendingMode === 'none') {
          element.data.blendingMode = 0;
        } else if (element.data.blendingMode === 'normal') {
          element.data.blendingMode = 1;
        } else if (element.data.blendingMode === 'additive') {
          element.data.blendingMode = 2;
        } else if (element.data.blendingMode === 'subtractive') {
          element.data.blendingMode = 3;
        } else if (element.data.blendingMode === 'multiply') {
          element.data.blendingMode = 4;
        }
      } else {
        element.data.blendingMode = 1;
      }

      const positionSpread = addParticleModularProperty(element, PARTICLE_POSITION_SPERAD, 0, 0, 0);
      const velocityValue = addParticleModularProperty(element, PARTICLE_VELOCITY_VALUE, 0, 25, 0);
      const velocitySpread = addParticleModularProperty(element, PARTICLE_VELOCITY_SPREAD, 10, 7.5, 10);
      const accelerationValue = addParticleModularProperty(element, PARTICLE_ACCELERATION_VALUE, 0, -10, 0);
      const accelerationSpread = addParticleModularProperty(element, PARTICLE_ACCELERATION_SPREAD, 10, 0, 10);

      element.element.setAttribute('particle-system', {
        enabled: false,
        type: element.data.type,
        blending: 1,
        color: element.data.color,
        duration: element.data.duration,
        maxAge: element.data.maxAge,
        opacity: element.data.opacity,
        particleCount: element.data.particleCout,
        rotationAxis: element.data.rotationAxis,
        size: element.data.size,
        texture: getAssetDataUrl(element.asset.data),
        positionSpread: {x: positionSpread.x, y: positionSpread.y, z: positionSpread.z},
        velocityValue: {x: velocityValue.x, y: velocityValue.y, z: velocityValue.z},
        velocitySpread: {x: velocitySpread.x, y: velocitySpread.y, z: velocitySpread.z},
        accelerationValue: {x: accelerationValue.x, y: accelerationValue.y, z: accelerationValue.z},
        accelerationSpread: {x: accelerationSpread.x, y: accelerationSpread.y, z: accelerationSpread.z},
      });
    }

    function addParticleModularProperty(element, type, x, y, z) {
      const p = element.data.particleProperties.find((p) => p.type === type);
      if (p !== undefined) {
        p.x = p.x !== null ? p.x : x;
        p.y = p.y !== null ? p.y : y;
        p.z = p.z !== null ? p.z : z;
        return p;
      } else {
        let defaultProperty = {
          type: type,
          x: x,
          y: y,
          z: z
        }
        element.data.particleProperties.push(defaultProperty);
        return defaultProperty;
      }
    }

    //Start Animations
    function setupPositionStartAnimation(element) {
      const p = element.data.properties.find((p) => p.type === POSITION);
      const a = element.data.startAnimations.find((a) => a.type === POSITION);
      const values = setupStartValues(p, a);
      element.element.object3D.position.set(
        values.fromX,
        values.fromY,
        values.fromZ
      );

      const animationName = 'animation__position_start';

      element.element.setAttribute(
        animationName,
        `
        property: ${POSITION}; from: ${values.fromX} ${values.fromY} ${
          values.fromZ
        };
        to: ${p.x} ${p.y} ${p.z}; dur: ${values.duration * 1000};
        delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${START_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    function setupRotationStartAnimation(element) {
      const p = element.data.properties.find((p) => p.type === ROTATION);
      const a = element.data.startAnimations.find((a) => a.type === ROTATION);
      const values = setupStartValues(p, a);
      element.element.object3D.rotation.set(
        THREE.Math.degToRad(values.fromX),
        THREE.Math.degToRad(values.fromY),
        THREE.Math.degToRad(values.fromZ)
      );

      const animationName = 'animation__rotation_start';

      element.element.setAttribute(
        animationName,
        `
        property: ${ROTATION}; from: ${values.fromX} ${values.fromY} ${
          values.fromZ
        };
        to: ${p.x} ${p.y} ${p.z}; dur: ${values.duration * 1000}; delay: ${
          values.delay * 1000
        };
        easing: ${values.easing}; startEvents: ${START_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    function setupScaleStartAnimation(element) {
      const p = element.data.properties.find((p) => p.type === SCALE);
      const a = element.data.startAnimations.find((a) => a.type === SCALE);
      const values = setupStartValues(p, a);

      if (values.fromX === 0) {
        values.fromX = 0.000001;
      }

      if (values.fromY === 0) {
        values.fromY = 0.000001;
      }

      if (values.fromZ === 0) {
        values.fromZ = 0.000001;
      }

      element.element.object3D.scale.set(
        values.fromX,
        values.fromY,
        values.fromZ
      );

      const animationName = 'animation__scale_start';

      element.element.setAttribute(
        animationName,
        `
        property: ${SCALE}; from: ${values.fromX} ${values.fromY} ${
          values.fromZ
        }; to: ${p.x} ${p.y} ${p.z};  dur: ${values.duration * 1000}; delay: ${
          values.delay * 1000
        }; easing: ${values.easing}; startEvents: ${START_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    function setupColorStartAnimation(element) {
      const p = element.data.properties.find((p) => p.type === COLOR);
      const a = element.data.startAnimations.find((a) => a.type === COLOR);
      const values = setupStartValues(p, a);

      const fromColor =
        '#' +
        new THREE.Color(
          Math.round(values.fromX / 255),
          Math.round(values.fromY / 255),
          Math.round(values.fromZ / 255)
        ).getHexString();

      const toColor =
        '#' +
        new THREE.Color(
          Math.round(p.x / 255),
          Math.round(p.y / 255),
          Math.round(p.z / 255)
        ).getHexString();

      element.element.setAttribute('material', 'color', fromColor);

      const animationName = 'animation__color_start';

      element.element.setAttribute(
        animationName,
        `
        property: ${COLOR}; from: ${fromColor}; to: ${toColor};  dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${START_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    function setupOpacityStartAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.startAnimations.find((a) => a.type === OPACITY);
      const values = setupStartValues(p, a);

      element.element.setAttribute('material', 'opacity', values.fromX);

      const animationName = 'animation__opacity_start';

      element.element.setAttribute(
        animationName,
        `
        property: material.opacity; from: ${values.fromX}; to: ${p.x};
        dur: ${values.duration * 1000}; delay: ${values.delay * 1000};
        easing: ${values.easing}; startEvents: ${START_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    function setupChildOpacityStartAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.startAnimations.find((a) => a.type === OPACITY);
      const values = setupStartValues(p, a);

      element.childElement.setAttribute('material', 'opacity', values.fromX);

      const animationName = 'animation__opacity_start';

      element.childElement.setAttribute(
        animationName,
        `
        property: material.opacity; from: ${values.fromX}; to: ${p.x};
        dur: ${values.duration * 1000}; delay: ${values.delay * 1000};
        easing: ${values.easing}; startEvents: ${START_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    function setupModelOpacityStartAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.startAnimations.find((a) => a.type === OPACITY);
      const values = setupStartValues(p, a);

      element.element.setAttribute('model-opacity', values.fromX);

      const animationName = 'animation__opacity_start';

      element.element.setAttribute(
        animationName,
        `
        property: model-opacity; from: ${values.fromX}; to: ${p.x};
        dur: ${values.duration * 1000}; delay: ${values.delay * 1000};
        easing: ${values.easing}; startEvents: ${START_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    //End Animations
    function setupElementEndAnimations(element) {
      for (const a of element.data.endAnimations) {
        if (a.trigger === START_AFTER_TIME_TRIGGER) {
          element.element.classList.add(TIME_END_ANIMATION_CLASS);

          if (element.childElement) {
            element.childElement.classList.add(TIME_END_ANIMATION_CLASS);
          }

          if (a.type === POSITION) {
            setupPositionTimeEndAnimation(element);
          } else if (a.type === ROTATION) {
            setupRotationTimeEndAnimation(element);
          } else if (a.type === SCALE) {
            setupScaleTimeEndAnimation(element);
          } else if (a.type === COLOR) {
            setupColorTimeEndAnimation(element);
          } else if (a.type === OPACITY) {
            if (element.childElement) {
              setupChildOpacityTimeEndAnimation(element);
            } else if (element.data[COMPONENT] === MODEL_ELEMENT) {
              setupModelOpacityTimeEndAnimation(element);
            } else {
              setupOpacityTimeEndAnimation(element);
            }
          }
        } else if (a.trigger === START_AFTER_VIDEO_TRIGGER) {
          element.element.classList.add(a.videoAssetUniqueName);

          if (element.childElement) {
            element.childElement.classList.add(a.videoAssetUniqueName);
          }
          if (a.type === POSITION) {
            setupPostionVideoEndAnimation(element);
          } else if (a.type === ROTATION) {
            setupRotationVideoEndAnimation(element);
          } else if (a.type === SCALE) {
            setupScaleVideoEndAnimation(element);
          } else if (a.type === COLOR) {
            setupColorVideoEndAnimation(element);
          } else if (a.type === OPACITY) {
            if (element.childElement) {
              setupChildOpacityVideoEndAnimation(element);
            } else if (element.data[COMPONENT] === MODEL_ELEMENT) {
              setupModelOpacityVideoEndAnimation(element);
            } else {
              setupOpacityVideoEndAnimation(element);
            }
          }
        }
      }
    }

    function setupEndValues(property, animation) {
      let values = {};
      values.toX = animation.toX !== null ? animation.toX : property.x;
      values.toY = animation.toY !== null ? animation.toY : property.y;
      values.toZ = animation.toZ !== null ? animation.toZ : property.z;
      values.duration = animation.duration !== null ? animation.duration : 1;
      values.delay = animation.delay !== null ? animation.delay : 0;
      values.easing = animation.easing !== null ? animation.easing : 'linear';
      return values;
    }

    function setupPostionVideoEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === POSITION);
      const a = element.data.endAnimations.find((a) => a.type === POSITION);
      const values = setupEndValues(p, a);

      const animationName = 'animation__position_video_end';

      element.element.setAttribute(
        animationName,
        `
        property: ${POSITION}; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${values.easing}; startEvents: ${
          a.videoAssetUniqueName
        }
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupRotationVideoEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === ROTATION);
      const a = element.data.endAnimations.find((a) => a.type === ROTATION);
      const values = setupEndValues(p, a);

      const animationName = 'animation__rotation_video_end';

      element.element.setAttribute(
        animationName,
        `
        property: ${ROTATION}; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${values.easing}; startEvents: ${
          a.videoAssetUniqueName
        }
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupScaleVideoEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === SCALE);
      const a = element.data.endAnimations.find((a) => a.type === SCALE);
      const values = setupEndValues(p, a);

      if (values.toX === 0) {
        values.toX = 0.000001;
      }

      if (values.toY === 0) {
        values.toY = 0.000001;
      }

      if (values.toZ === 0) {
        values.toZ = 0.000001;
      }

      const animationName = 'animation__scale_video_end';

      element.element.setAttribute(
        animationName,
        `
        property: ${SCALE}; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${values.easing}; startEvents: ${
          a.videoAssetUniqueName
        }
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupColorVideoEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === COLOR);
      const a = element.data.endAnimations.find((a) => a.type === COLOR);
      const values = setupEndValues(p, a);

      const fromColor =
        '#' +
        new THREE.Color(
          Math.round(p.x / 255),
          Math.round(p.y / 255),
          Math.round(p.z / 255)
        ).getHexString();

      const toColor =
        '#' +
        new THREE.Color(
          Math.round(values.toX / 255),
          Math.round(values.toY / 255),
          Math.round(values.toZ / 255)
        ).getHexString();

      const animationName = 'animation__color_video_end';

      element.element.setAttribute(
        animationName,
        `
        property: ${COLOR}; from: ${fromColor}
        to: ${toColor}; dur: ${values.duration * 1000};
        delay: ${values.delay * 1000}; easing: ${values.easing}; startEvents: ${
          a.videoAssetUniqueName
        }
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupOpacityVideoEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.endAnimations.find((a) => a.type === OPACITY);
      const values = setupEndValues(p, a);

      const animationName = 'animation__opacity_video_end';

      element.element.setAttribute(
        animationName,
        `
        property: material.opacity; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${values.easing}; startEvents: ${
          a.videoAssetUniqueName
        }
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupChildOpacityVideoEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.endAnimations.find((a) => a.type === OPACITY);
      const values = setupEndValues(p, a);

      const animationName = 'animation__opacity_video_end';

      element.childElement.setAttribute(
        animationName,
        `
        property: material.opacity; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${values.easing}; startEvents: ${
          a.videoAssetUniqueName
        }
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupModelOpacityVideoEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.endAnimations.find((a) => a.type === OPACITY);
      const values = setupEndValues(p, a);

      const animationName = 'animation__opacity_video_end';

      element.element.setAttribute(
        animationName,
        `
        property: model-opacity; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${values.easing}; startEvents: ${
          a.videoAssetUniqueName
        }
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    function setupPositionTimeEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === POSITION);
      const a = element.data.endAnimations.find((a) => a.type === POSITION);
      const values = setupEndValues(p, a);

      const animationName = 'animation__position_time_end';

      element.element.setAttribute(
        animationName,
        `
        property: ${POSITION}; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${TIME_END_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupRotationTimeEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === ROTATION);
      const a = element.data.endAnimations.find((a) => a.type === ROTATION);
      const values = setupEndValues(p, a);

      const animationName = 'animation__rotation_time_end';

      element.element.setAttribute(
        animationName,
        `
        property: ${ROTATION}; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${TIME_END_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupScaleTimeEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === SCALE);
      const a = element.data.endAnimations.find((a) => a.type === SCALE);
      const values = setupEndValues(p, a);

      if (values.toX === 0) {
        values.toX = 0.000001;
      }

      if (values.toY === 0) {
        values.toY = 0.000001;
      }

      if (values.toZ === 0) {
        values.toZ = 0.000001;
      }

      const animationName = 'animation__scale_time_end';

      element.element.setAttribute(
        animationName,
        `
        property: ${SCALE}; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${TIME_END_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }

    function setupColorTimeEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === COLOR);
      const a = element.data.endAnimations.find((a) => a.type === COLOR);
      const values = setupEndValues(p, a);

      const fromColor =
        '#' +
        new THREE.Color(
          Math.round(p.x / 255),
          Math.round(p.y / 255),
          Math.round(p.z / 255)
        ).getHexString();

      const toColor =
        '#' +
        new THREE.Color(
          Math.round(values.toX / 255),
          Math.round(values.toY / 255),
          Math.round(values.toZ / 255)
        ).getHexString();

      const animationName = 'animation__color_time_end';

      element.element.setAttribute(
        animationName,
        `
        property: ${COLOR}; from: ${fromColor};
        to: ${toColor}; dur: ${values.duration * 1000};
        delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${TIME_END_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupOpacityTimeEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.endAnimations.find((a) => a.type === OPACITY);
      const values = setupEndValues(p, a);

      const animationName = 'animation__opacity_time_end';

      element.element.setAttribute(
        animationName,
        `
        property: material.opacity; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${TIME_END_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupChildOpacityTimeEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.endAnimations.find((a) => a.type === OPACITY);
      const values = setupEndValues(p, a);

      const animationName = 'animation__opacity_time_end';

      element.childElement.setAttribute(
        animationName,
        `
        property: material.opacity; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
        delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${TIME_END_ANIMATION_EVENT}
        `
      );

      triggerAudioWithAnimation(element, a, animationName);
    }
    function setupModelOpacityTimeEndAnimation(element) {
      const p = element.data.properties.find((p) => p.type === OPACITY);
      const a = element.data.endAnimations.find((a) => a.type === OPACITY);
      const values = setupEndValues(p, a);

      const animationName = 'animation__opacity_time_end';

      element.element.setAttribute(
        animationName,
        `
        property: model-opacity; from: ${p.x} ${p.y} ${p.z};
        to: ${values.toX} ${values.toY} ${values.toZ}; dur: ${
          values.duration * 1000
        };
 	delay: ${values.delay * 1000}; easing: ${
          values.easing
        }; startEvents: ${TIME_END_ANIMATION_EVENT}
        `
	);
      triggerAudioWithAnimation(element, a, animationName);
    }
  },
};
//Components
     // triggerAudioWithAnimation(element, a, animationName);
    //}
  //},
//};
