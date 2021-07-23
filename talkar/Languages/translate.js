
let french = require('../Languages/fr.js')
let italian = require('../Languages/it.js')
let spanish = require('../Languages/sp.js')
let german = require('../Languages/gr.js')
const axios = require('axios')
let resLang
let dataLang;

module.exports = 
async function Translate() {

    try {
        // resLang = await axios.get(`http://localhost:1337/languages/1`)
        // dataLang = resLang.data
        // console.log('this is lang', dataLang)
        var userLang = navigator.language || navigator.userLanguage;
    console.log(userLang)
    let lang = []
    lang = userLang.split("-")
    console.log('===>',lang)
    if (lang[0] == "fr"){
        resLang = await axios.get(`http://localhost:1337/languages/3`)
        // resLang = await axios.get(` https://38851888a139.ngrok.io/languages/3`)
        dataLang = resLang.data
        console.log('this is lang', dataLang)
        document.getElementById("tap").innerHTML = dataLang.Tap;
        document.getElementById("aim").innerHTML = dataLang.Aim;
        document.getElementById("talkar-button").innerHTML= dataLang.Learn;
        document.getElementById("talkar-title").innerHTML= french.TalkarAr;
    }
    if (lang[0] == "de"){
        resLang = await axios.get(`http://localhost:1337/languages/4`)
        // resLang = await axios.get(` https://38851888a139.ngrok.io/languages/4`)
        dataLang = resLang.data
        document.getElementById("tap").innerHTML = dataLang.Tap;
        document.getElementById("aim").innerHTML = dataLang.Aim;
        document.getElementById("talkar-button").innerHTML= dataLang.Learn;
        document.getElementById("talkar-title").innerHTML= german.TalkarAr;
        

    }
    if (lang[0] == "it"){
        resLang = await axios.get(`http://localhost:1337/languages/5`)
        // resLang = await axios.get(` https://38851888a139.ngrok.io/languages/5`)
        dataLang = resLang.data
        document.getElementById("tap").innerHTML = dataLang.Tap;
        document.getElementById("aim").innerHTML = dataLang.Aim;
        document.getElementById("talkar-button").innerHTML= dataLang.Learn;
        document.getElementById("talkar-title").innerHTML= italian.TalkarAr;
    }
    if (lang[0] == "es"){
        resLang = await axios.get(`http://localhost:1337/languages/2`)
        // resLang = await axios.get(` https://38851888a139.ngrok.io/languages/2`)
        dataLang = resLang.data
        document.getElementById("tap").innerHTML = dataLang.Tap;
        document.getElementById("aim").innerHTML = dataLang.Aim;
        document.getElementById("talkar-button").innerHTML= dataLang.Learn;
        document.getElementById("talkar-title").innerHTML= spanish.TalkarAr;
    }
    else {
        return;
    }
    } catch (error) {
        
    }
    
}