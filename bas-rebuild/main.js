let bldgs = null;
let map = null;
let pin = null;

// HTML 뿐만 아니라 이미지, CSS, 폰트 등 모든 리소스가 로드된 후
window.onload = function () {
  document.getElementById("search").focus();
  document.querySelector("#search").removeAttribute("required");
  document.querySelector("input").focus();
};

window.addEventListener("keydown", (e) => {
    if (e.key === 'Shift') {
    document.querySelector("#search").removeAttribute("required");
    document.querySelector("input").focus();
  } else if (e.key === 'Control') {
    document.querySelector("#search").required = true;
    document.querySelector("input").blur();
  } else if (e.key === 'Escape'){
    document.querySelector("#search").value = "";
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === 'Enter') {
    document.querySelector('#bldg')?.click();
  }
});

// Autocomplete setup
let autocomplete = (function () {
  let _inp = null;
  let _arr = [];
  let _currentFocus;

  let _setAutocomplete = function (inp, arr) {
    _arr = arr;
    _inp = inp;
    _inp.addEventListener("input", inputEvent);
    _inp.addEventListener("keydown", keydownEvent);
  };

  let inputEvent = function () {
    let a, val = this.value;
    closeAllLists();
    if (!val || val.length < 2) return;
    _currentFocus = -1;
    a = document.createElement("DIV");
    a.setAttribute("id", this.id + "-autocomplete-list");
    a.setAttribute("class", "autocomplete-items");

    for (let i = 0; i < _arr.length; i++) {
      if (
        _arr[i].toUpperCase().startsWith(val.toUpperCase())
      ) {
        const strong = document.createElement("strong");
        const b = document.createElement("DIV");
        b.appendChild(strong)
        strong.textContent = _arr[i].slice(0, val.length);
        b.append(_arr[i].slice(val.length))
        b.addEventListener("click", function () {
          _inp.value = _arr[i];
          closeAllLists();
        });
        a.appendChild(b);
      }
    }
    if (a.children.length) this.parentNode.appendChild(a);
  };

  let keydownEvent = function (e) {
    let items;
    let list = document.getElementById(this.id + "-autocomplete-list");
    if (list) items = list.querySelectorAll("div");
    if (e.key === 'ArrowDown') {
      _currentFocus++;
      addActive(items);
    } else if (e.key === 'ArrowUp') {
      _currentFocus--;
      addActive(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_currentFocus > -1) if (items) items[_currentFocus].click();
    }
  };

  let addActive = function (items) {
    if (!items || items.length <= 0) return;
    removeActive(items);
    if (_currentFocus >= items.length) _currentFocus = 0;
    if (_currentFocus < 0) _currentFocus = items.length - 1;
    items[_currentFocus].classList.add("autocomplete-active");
  };

  let removeActive = items => items.forEach(a=>a.classList.remove("autocomplete-active"))

  let closeAllLists = () => document.querySelectorAll(".autocomplete-items").forEach(a=> a.remove());

  return {
    setAutocomplete: function (inp, arr) {
      _setAutocomplete(inp, arr);
    },
  };
})();

async function loadBldg() {
    const res = await fetch('data/buildings.json');
    if(!res.ok) throw new Error('빌딩 데이터 로드 실패');
    return res.json();
}

const W = 1536, H = 1024;   // demo_map1.png 실제 픽셀 크기
const OX = 0, OY = 0

const toLatLng = ({top, left}) => [-top, left];

function createMap() {

    const bounds = [toLatLng({top:OY, left:OX}), toLatLng({top:OY+H, left:OX+W})]

    const map = L.map('map', {
        crs:L.CRS.Simple,
        minZoom: -2, maxZoom: 2,
        zoomSnap: 0.25,           // 줌 단위 (기본값 1)
        attributionControl: false // 오른쪽 아래 출처 표시 끄기
    });

    L.imageOverlay('images/demo_map1.png', bounds).addTo(map)
    map.fitBounds(bounds);

    // 이미지 좌측 하단 모서리에 고정되는 안내 문구 (줌/팬을 따라 이미지와 함께 움직인다)
    L.marker(toLatLng({top: OY + H, left: OX}), {
        icon: L.divIcon({
            className: 'map-notice',
            html: '<div class="map-notice-text">※ 이 이미지는 실제 지도가 아니며, 포트폴리오용으로 생성된 이미지입니다.</div>',
            iconSize: [0, 0], iconAnchor: [-12, 8],
        }),
        interactive: false, keyboard: false,
    }).addTo(map);

    map.on('click', e => console.log(e.latlng));

    return map
}

// 10x10 링크의 중심이 건물 좌표를 가리키도록 앵커를 잡는다
const MARKER_SIZE = [10, 10];
const MARKER_ANCHOR = [5, 5];

// pin.png(549x455)를 너비 75px로 표시할 때의 크기. 핀 끝(하단 중앙)이 좌표를 가리킨다
const PIN_W = 75;
const PIN_H = Math.round(PIN_W * 455 / 549);

function createMarker(bldg) {
    const a = Object.assign(document.createElement('a'), {
        className:`${bldg.linkClass} marker_link`, href: bldg.href, target:'_top',
    });
    const info = Object.assign(document.createElement('div'), {
        className: `${bldg.infoClass} marker_info`, textContent:bldg.label,
    });
    const html = document.createElement('div');
    html.append(a, info);

    return L.marker(toLatLng(bldg.position), {
        icon: L.divIcon({
            className: `${bldg.id} marker`, html,
            iconSize: MARKER_SIZE, iconAnchor: MARKER_ANCHOR,
        }),
        keyboard: false,
    });
}

function showPin(hit) {
    const img = Object.assign(document.createElement('img'), {className: 'point', src: 'images/pin.png'});
    img.style.width = `${PIN_W}px`;
    const text = Object.assign(document.createElement('p'), {className: 'text', textContent: hit.textContent});
    const a = Object.assign(document.createElement('a'), {id: 'bldg', href: hit.href, target: '_top'});
    a.append(img, text);

    hidePin();
    pin = L.marker(toLatLng(hit.position), {
        icon: L.divIcon({
            className: 'user-wrap', html: a,
            iconSize: [PIN_W, PIN_H], iconAnchor: [PIN_W / 2, PIN_H],
        }),
        keyboard: false, zIndexOffset: 1000,
    }).addTo(map);
}

function hidePin() {
    pin?.remove();
    pin = null;
}

async function main() {
    try{
        map = createMap()
        bldgs = await loadBldg();
        bldgs.buildings.forEach(bldg => createMarker(bldg).addTo(map));

        const ids = bldgs.buildings.map(b=>b.id).sort();
        autocomplete.setAutocomplete(document.querySelector('#search'), ids);
    }catch (err) {
        console.error(err)
    }
}

function filter() {
    let bldgnum = document.querySelector("#search").value;
    
    if (bldgnum.length === 3) {
        bldgnum = "B00" + bldgnum;
    } else if (bldgnum.length === 4) {
        bldgnum = "B0" + bldgnum;
    } else if(bldgnum.length === 5) {
        bldgnum = "B" + bldgnum
    }

    const hit = bldgs?.buildings.find(b=>b.id === bldgnum);
    
    if(!hit) {
        document.querySelector('.listBox').replaceChildren();
        hidePin();
        return;
    }


    const pinStyle = {
        top: `${hit.position.top}px`,
        left: `${hit.position.left}px`,
    };

    const listInner = document.createElement('div');
    listInner.className = 'listInner';
    Object.assign(listInner.style, pinStyle);

    const bldgDiv = document.createElement('div');
    bldgDiv.className = `pin_${hit.id}`
    bldgDiv.textContent = hit.textContent;
    listInner.append(bldgDiv);

    const listBox = document.querySelector('.listBox');
    listBox.replaceChildren(listInner);

    showPin(hit);
}

main();