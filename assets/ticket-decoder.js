(function(root) {
  'use strict';
  root.StudentQrTicketDecoder = {
    create({reader,wasmUrl}) {
      let initialization;
      const options = {formats:['Code128','QRCode'],maxNumberOfSymbols:0,returnErrors:true,textMode:'Plain',tryHarder:true,tryRotate:true,tryInvert:true};
      function initialize() {
        if (!initialization) initialization = Promise.resolve().then(() => {
          if (!reader?.prepareZXingModule || !reader?.readBarcodes) throw Error('Live multi-ticket decoder unavailable. Use exact manual entry.');
          return reader.prepareZXingModule({overrides:{locateFile:path => {
            if (path.endsWith('.wasm')) return wasmUrl;
            throw Error('Unexpected decoder asset.');
          }},fireImmediately:true});
        });
        return initialization;
      }
      function selectSingle(results) {
        if (!Array.isArray(results)) return {kind:'invalid'};
        if (!results.length) return {kind:'none'};
        if (results.some(r => !r || r.isValid !== true || r.error || !['Code128','QRCode'].includes(r.format) || typeof r.text !== 'string' || !r.text || r.text.trim() !== r.text || /[\u0000-\u001f\u007f-\u009f]/.test(r.text))) return {kind:'invalid'};
        const values = [...new Set(results.map(r => r.text))];
        return values.length === 1 ? {kind:'single',ticket:values[0]} : {kind:'ambiguous'};
      }
      return {initialize,selectSingle,async decode(input) { await initialize(); return reader.readBarcodes(input,options); }};
    }
  };
})(window);
