const axios = require('axios')
let resLang
let dataLang;
// module.exports = 
async function Language() {
    try {
        resLang = await axios.get(`http://localhost:1337/languages/1`)
        // resLang = await axios.get(` https://38851888a139.ngrok.io/languages/1`)
        dataLang = resLang.data
        // console.log('this is lang', dataLang)
        return 
    } catch (error) {
        console.log(error)
    }
}

export default Language;


