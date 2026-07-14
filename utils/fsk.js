/**
 * FSK 调制解调引擎
 * 调制部分移植自 http://gyu.que.jp/private/jsfsk/ 的 fsk.js
 * 解调部分为新增实现（原站仅有调制）
 *
 * 技术参数:
 * - 载波频率: Mark(1)=2100Hz, Space(0)=1300Hz
 * - 主频率: 100Hz (用于波形表生成)
 * - 波特率: 150bps (294 samples/bit) 或 300bps (147 samples/bit)
 * - 采样率: 44100Hz, 16-bit PCM
 */

var RS = require('./rscode.js');
var ReedSolomonEncoder = RS.ReedSolomonEncoder;
var ReedSolomonDecoder = RS.ReedSolomonDecoder;

var CARRIER_FQ1 = 2100; // Mark (bit=1)
var CARRIER_FQ2 = 1300; // Space (bit=0)
var CARRIER_FQM = 100;  // Master frequency
var SAMPLE_RATE = 44100;

/**
 * FSK 调制器
 */
function FSKModulator(highspeed) {
  this.baudRate = highspeed ? 300 : 150;
  this.samplesPerBit = highspeed ? 147 : 294;
  this.readStep1 = CARRIER_FQ1 / CARRIER_FQM;
  this.readStep2 = CARRIER_FQ2 / CARRIER_FQM;
  this.wavTable = null;
  this.bitBuffer = [];
  this.bitCount = 0;
  this.shiftCount = 0;
  this.setupTable();
  this.clear();
}

FSKModulator.prototype = {
  setupTable: function() {
    var samples = SAMPLE_RATE / CARRIER_FQM;
    this.wavTable = new Array(samples);
    for (var i = 0; i < samples; i++) {
      this.wavTable[i] = (Math.sin(Math.PI * 2.0 * i / samples) * 8192) | 0;
    }
  },

  clear: function() {
    this.bitCount = 0;
    this.shiftCount = 0;
    this.bitBuffer = [0];
  },

  appendBit: function(b) {
    if (b !== 0) {
      this.bitBuffer[this.bitBuffer.length - 1] |= (1 << this.shiftCount);
    }
    ++this.shiftCount;
    if ((++this.bitCount & 0xf) === 0) {
      this.bitBuffer.push(0);
      this.shiftCount = 0;
    }
  },

  readBit: function(i) {
    var block = i >> 4;
    var ofs = i & 0xf;
    return (this.bitBuffer[block] >> ofs) & 1;
  },

  /**
   * 生成 PCM 采样数组
   * @param {boolean} withDing - 是否添加880Hz提示音
   * @returns {number[]} 16-bit PCM 采样数组
   */
  generateSamples: function(withDing) {
    var datalen = this.bitCount;
    var blen = this.samplesPerBit;
    var slen = blen * datalen;
    var step;
    var bitPos = 0;
    var tblPos = 0;

    var tbl = this.wavTable;
    var tlen = tbl.length;

    var dingLen = withDing ? SAMPLE_RATE : 0;
    var samps = new Array(dingLen + slen);

    if (withDing) {
      this.insertDing(samps, dingLen);
    }

    for (var i = 0; i < slen; i++) {
      if (i % blen === 0) {
        step = this.readBit(bitPos++) ? this.readStep2 : this.readStep1;
      }
      tblPos = (tblPos + step) % tlen;
      samps[dingLen + i] = tbl[tblPos];
    }

    return samps;
  },

  insertDing: function(a, len) {
    var step = 880 * Math.PI / SAMPLE_RATE;
    for (var i = 0; i < len; i++) {
      var vol = (len - (i << 1)) / len;
      if (vol < 0.001) {
        a[i] = 0;
      } else {
        a[i] = (Math.sin(i * step) * vol * 22000.0) | 0;
      }
    }
  }
};

/**
 * FSK 解调器
 * 使用过零检测法 (Zero-Crossing Detection)
 */
function FSKDemodulator() {
  this.samplesPerBit = 294; // 150bps
  this.markFreq = CARRIER_FQ1;
  this.spaceFreq = CARRIER_FQ2;
  this.threshold = (CARRIER_FQ1 + CARRIER_FQ2) / 2; // 1700Hz
  this.bitBuffer = [];
  this.state = 'idle'; // idle | synchronizing | receiving
}

FSKDemodulator.prototype = {
  /**
   * 解调 PCM 采样数据为 bit 流
   * @param {number[]} samples - 16-bit PCM 采样数组
   * @returns {number[]} bit 数组
   */
  demodulate: function(samples) {
    var bits = [];
    var i = 0;
    var len = samples.length;

    while (i < len - this.samplesPerBit) {
      // 计算一个 bit 周期内的过零次数
      var zeroCrossings = 0;
      var prevSign = samples[i] >= 0;

      for (var j = 0; j < this.samplesPerBit; j++) {
        var currSign = samples[i + j] >= 0;
        if (currSign !== prevSign) {
          zeroCrossings++;
        }
        prevSign = currSign;
      }

      // 过零次数对应频率: freq = zeroCrossings * sampleRate / (2 * samplesPerBit)
      var detectedFreq = zeroCrossings * SAMPLE_RATE / (2 * this.samplesPerBit);

      // 判定 bit 值
      if (detectedFreq > this.threshold) {
        bits.push(1); // Mark (2100Hz)
      } else {
        bits.push(0); // Space (1300Hz)
      }

      i += this.samplesPerBit;
    }

    return bits;
  },

  /**
   * 从 bit 流中提取帧数据
   * 寻找 Preamble (22个交替的 10 + 1个同步位)
   * @param {number[]} bits - bit 流
   * @returns {number[]|null} 字节数组，或 null（未找到有效帧）
   */
  extractFrame: function(bits) {
    // 查找 Preamble: 22组 "10" 交替
    var preambleLen = 44; // 22 * 2
    var syncBit;
    var frameStart = -1;

    for (var i = 0; i <= bits.length - preambleLen - 1; i++) {
      var match = true;
      for (var j = 0; j < 22; j++) {
        if (bits[i + j * 2] !== 1 || bits[i + j * 2 + 1] !== 0) {
          match = false;
          break;
        }
      }

      if (match) {
        syncBit = bits[i + preambleLen];
        frameStart = i + preambleLen + 1;
        break;
      }
    }

    if (frameStart === -1) {
      return null;
    }

    // 读取消息头 (2字节，重复)
    var dataLen = this.bitsToByte(bits, frameStart);
    var dataLen2 = this.bitsToByte(bits, frameStart + 8);

    if (dataLen !== dataLen2 || dataLen > 223) {
      return null;
    }

    // 读取数据块 + 校验块
    var totalLen = dataLen + ReedSolomonEncoder.getParityLength();
    var bytes = new Array(totalLen);

    for (var k = 0; k < totalLen; k++) {
      bytes[k] = this.bitsToByte(bits, frameStart + 16 + k * 8);
    }

    // 补齐到 223 字节
    var fullData = new Array(223).fill(0);
    for (var m = 0; m < dataLen; m++) {
      fullData[m] = bytes[m];
    }

    // 附加校验字节
    var parity = new Array(32);
    for (var n = 0; n < 32; n++) {
      parity[n] = bytes[dataLen + n];
    }

    return {
      data: fullData,
      parity: parity,
      dataLength: dataLen
    };
  },

  bitsToByte: function(bits, offset) {
    var val = 0;
    for (var i = 0; i < 8; i++) {
      if (bits[offset + i]) {
        val |= (1 << i);
      }
    }
    return val;
  }
};

/**
 * 消息构建器
 * 负责将文本转换为完整的 FSK 帧
 */
function MessageBuilder(modulator, highspeed) {
  this.modulator = modulator;
  this.speed = highspeed ? 2 : 1;
  this.bytes = [];
  this.blocks = [];
}

MessageBuilder.prototype = {
  clear: function() {
    this.bytes.length = 0;
    this.blocks.length = 0;
  },

  /**
   * 将文本转换为字节数组 (使用 URI 编码处理多字节字符)
   */
  setBytesFromText: function(text) {
    this.bytes.length = 0;
    var encoded = encodeURI(text);
    var pos = 0;
    var len = encoded.length;

    while (pos < len) {
      var k = encoded.charCodeAt(pos);
      if (k === 0x25) { // '%' 字符
        k = parseInt(encoded.charAt(++pos), 16) << 4;
        k |= parseInt(encoded.charAt(++pos), 16);
      }
      this.bytes.push(k);
      pos++;
    }

    return this.bytes;
  },

  /**
   * 构建完整的 FSK 帧
   */
  build: function() {
    this.modulator.clear();
    this.makeEncodedBlocks();
    this.appendPrologue();
    this.appendPreamble(1 - this.getFirstBit());
    this.appendMessageHeader();
    this.appendBlocks();
    this.appendEpilogue();
  },

  makeEncodedBlocks: function() {
    var dlen = ReedSolomonEncoder.getDataLength();
    var plen = ReedSolomonEncoder.getParityLength();
    var blockLength = this.bytes.length;
    var padding = 0;
    var i;

    if (blockLength >= dlen) {
      blockLength = dlen;
    } else {
      padding = dlen - blockLength;
    }

    var tmp = new Array(dlen);
    var pbuf = new Array(plen);

    for (i = 0; i < blockLength; i++) {
      tmp[i] = this.bytes[i];
    }
    for (; i < dlen; i++) {
      tmp[i] = 0;
    }

    ReedSolomonEncoder.encode(tmp, pbuf);

    this.blocks.push({
      dataBytes: tmp,
      parityBytes: pbuf,
      dataLength: blockLength
    });
  },

  getFirstBit: function() {
    return this.blocks[0].dataLength & 1;
  },

  appendMessageHeader: function() {
    var k = this.blocks[0].dataLength;
    this.appendByte(k);
    this.appendByte(k);
  },

  appendBlocks: function() {
    var len = this.blocks.length;
    var plen = ReedSolomonEncoder.getParityLength();
    var i, k;

    for (i = 0; i < len; i++) {
      var bk = this.blocks[i];
      var dlen = bk.dataLength;
      for (k = 0; k < dlen; k++) {
        this.appendByte(bk.dataBytes[k]);
      }
      for (k = 0; k < plen; k++) {
        this.appendByte(bk.parityBytes[k]);
      }
    }
  },

  appendPreamble: function(termBit) {
    for (var i = 0; i < 22; i++) {
      this.modulator.appendBit(1);
      this.modulator.appendBit(0);
    }
    this.modulator.appendBit(termBit);
  },

  appendPrologue: function() {
    this.writeBlank(96 * this.speed);
  },

  appendEpilogue: function() {
    this.writeBlank(42 * this.speed);
  },

  appendByte: function(k) {
    for (var i = 0; i < 8; i++) {
      this.modulator.appendBit((k >> i) & 1);
    }
  },

  writeBlank: function(count) {
    for (var i = 0; i < count; i++) {
      this.modulator.appendBit(0);
    }
  }
};

/**
 * WAV 文件生成器
 * 将 PCM 采样数组编码为 WAV 格式
 */
function generateWAV(samples, sampleRate) {
  var len = samples.length;
  var bytes = [];
  var i;

  // RIFF header
  var totalSize = len * 2 + 36;
  bytes.push(0x52, 0x49, 0x46, 0x46); // "RIFF"
  bytes.push(totalSize & 0xFF, (totalSize >> 8) & 0xFF, (totalSize >> 16) & 0xFF, (totalSize >> 24) & 0xFF);
  bytes.push(0x57, 0x41, 0x56, 0x45); // "WAVE"

  // fmt chunk
  bytes.push(0x66, 0x6D, 0x74, 0x20); // "fmt "
  bytes.push(0x10, 0x00, 0x00, 0x00); // chunk size = 16
  bytes.push(0x01, 0x00); // audio format = 1 (PCM)
  bytes.push(0x01, 0x00); // channels = 1
  bytes.push(sampleRate & 0xFF, (sampleRate >> 8) & 0xFF, (sampleRate >> 16) & 0xFF, (sampleRate >> 24) & 0xFF);
  var byteRate = sampleRate * 2;
  bytes.push(byteRate & 0xFF, (byteRate >> 8) & 0xFF, (byteRate >> 16) & 0xFF, (byteRate >> 24) & 0xFF);
  bytes.push(0x02, 0x00); // block align = 2
  bytes.push(0x10, 0x00); // bits per sample = 16

  // data chunk
  bytes.push(0x64, 0x61, 0x74, 0x61); // "data"
  var dataSize = len * 2;
  bytes.push(dataSize & 0xFF, (dataSize >> 8) & 0xFF, (dataSize >> 16) & 0xFF, (dataSize >> 24) & 0xFF);

  // PCM samples (16-bit LE)
  for (i = 0; i < len; i++) {
    var s = samples[i];
    if (s > 32767) s = 32767;
    else if (s < -32768) s = -32768;
    if (s < 0) s = 65536 + s;
    bytes.push(s & 0xFF, (s >> 8) & 0xFF);
  }

  // 转为 ArrayBuffer
  var buffer = new ArrayBuffer(bytes.length);
  var view = new DataView(buffer);
  for (i = 0; i < bytes.length; i++) {
    view.setUint8(i, bytes[i]);
  }

  return buffer;
}

module.exports = {
  FSKModulator: FSKModulator,
  FSKDemodulator: FSKDemodulator,
  MessageBuilder: MessageBuilder,
  generateWAV: generateWAV,
  CARRIER_FQ1: CARRIER_FQ1,
  CARRIER_FQ2: CARRIER_FQ2,
  SAMPLE_RATE: SAMPLE_RATE
};
