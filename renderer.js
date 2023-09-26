document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const languageSelect = document.getElementById('languageSelect');
  const tokenInput = document.getElementById('tokenInput');
  const collectorIdInput = document.getElementById('collectorIdInput');
  const apiUrlInput = document.getElementById('apiUrlInput');
  const serviceStatus = document.getElementById('serviceStatus');
  const connectionStatus = document.getElementById('connectionStatus');
  const transactionStatus = document.getElementById('transactionStatus');
  const transactionAmount = document.getElementById('transactionAmount');
  const transactionId = document.getElementById('transactionId');
  const transactionId1 = document.getElementById('transactionId1');
  const transactionTime = document.getElementById('transactionTime');
  const transactionTime1 = document.getElementById('transactionTime1');
  const heartbeatStatusElement = document.getElementById('HeartbeatStatus');
  const saveTokenButton = document.getElementById('savetoken');
  const statusMessageElement = document.getElementById('statusMessage');
  const reportedTransactionIds = new Set();

  let socket;
  let heartbeatInterval;
  let reconnectTimeout; // 添加一个变量来存储自动重新连接的定时
  let isManuallyDisconnected = false; // 用于跟踪用户是否主动断开连接
  let hasPlayedNotification = false; // 用于跟踪是否已经播报过通知
  let hasFirstTimeConnected = false;
  // 在全局作用域中初始化一个变量，用于存储复选框的状态
let isListeningForFailures = false;


  // 更新状态消息的函数
  function updateStatusMessage(message) {
    statusMessageElement.textContent = message;
  }

  saveTokenButton.addEventListener('click', async () => {
    const token = tokenInput.value;
    const collectorId = collectorIdInput.value;
    const apiUrl = apiUrlInput.value;

    localStorage.setItem('apiurl', apiUrl);
    localStorage.setItem('token', token);
    localStorage.setItem('collectorId', collectorId);

    console.log('数据已保存到本地存储');

    try {
      // 1. 获取基础API URL
      const baseApiUrlResponse = await fetch('https://api.youchuangs.xyz/api.txt');
      if (!baseApiUrlResponse.ok) {
        throw new Error('Failed to fetch base API URL');
      }
      const baseApiUrl = await baseApiUrlResponse.text();

      // 2. 保存token并获取random_name
      const formData = new FormData();
      formData.append('token', token);
      formData.append('collector_id', collectorId);

      const response = await fetch('https://api.youchuangs.xyz/save_token.php', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const responseData = await response.json();
        const randomName = responseData.random_name;

        const fullApiUrl = baseApiUrl + randomName;
        console.log('完整API URL:', fullApiUrl);  // 如果需要，可以在此打印完整的API URL

        // 更新页面元素
        const uuidSpan = document.getElementById('uuid');
        uuidSpan.dataset.fullUrl = fullApiUrl;  // Store the full URL in a data attribute, but don't display it
        uuidSpan.textContent = randomName;  // Only display the random_name part

        updateStatusMessage('保存成功');
      } else {
        throw new Error('Failed to save token and fetch random name');
      }
    } catch (error) {
      console.error('请求出错:', error);
      updateStatusMessage('请求失败');
    }
  });


  window.addEventListener('load', () => {
    // 恢复保存在 localStorage 中的数据
    const savedToken = localStorage.getItem('token');
    const savedCollectorId = localStorage.getItem('collectorId');
    const savedApiUrl = localStorage.getItem('apiurl');

    if (savedToken) {
      tokenInput.value = savedToken;
    }

    if (savedCollectorId) {
      collectorIdInput.value = savedCollectorId;
    }

    if (savedApiUrl) {
      apiUrlInput.value = savedApiUrl;
    }

    // 获取复选框的状态
    shouldAutoConnect = localStorage.getItem('shouldAutoConnect') === 'true';

    // 设置复选框的状态
    if (autoConnectCheckbox) {
      autoConnectCheckbox.checked = shouldAutoConnect;
    }

    // 根据用户之前的选择尝试自动连接
    if (shouldAutoConnect) {
      // 请确保定义了 connectWebSocket 函数，并提供所需的参数
      connectWebSocket(savedToken, savedCollectorId, savedApiUrl);
    }

    // 监听复选框状态的变化
    if (autoConnectCheckbox) {
      autoConnectCheckbox.addEventListener('change', (event) => {
        const shouldAutoConnect = event.target.checked;

        // 更新本地存储的自动连接选项
        localStorage.setItem('shouldAutoConnect', shouldAutoConnect);

        // 显示通知消息
        if (shouldAutoConnect) {
          alert('成功开启开机自动连接');
          console.log('用户选择了自动连接服务');
        } else {
          alert('成功关闭开机自动连接');
          console.log('用户取消了自动连接服务');
        }
      });
    }

    // 其他代码...
    const errorspeakCheckbox = document.getElementById('errorspeak');
    
    if (!errorspeakCheckbox) {
        console.error("未找到ID为'errorspeak'的复选框。请检查HTML元素。");
        return;
    }

    // 初始化复选框状态
    isListeningForFailures = localStorage.getItem('errorspeakState') === 'true';
    errorspeakCheckbox.checked = isListeningForFailures;
    
    errorspeakCheckbox.addEventListener('change', function() {
        const isChecked = this.checked;

        // 更新localStorage
        localStorage.setItem('errorspeakState', isChecked.toString());
        
        // 更新isListeningForFailures的值
        isListeningForFailures = isChecked;
    });
    //其他代码

    const languageSelect = document.getElementById('languageSelect');
    const customLanguageSelect = document.getElementById('customLanguageSelect');

    // 恢复保存在 localStorage 中的系统设置语言选择
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
      languageSelect.value = savedLanguage;
    }

    // 当用户更改系统设置的语言下拉列表时，保存他们的选择到 localStorage
    languageSelect.addEventListener('change', (event) => {
      const selectedLanguage = event.target.value;
      localStorage.setItem('language', selectedLanguage);
    });

    // 当用户更改个性化播报的语言下拉列表时，保存他们的选择到 localStorage
    customLanguageSelect.addEventListener('change', (event) => {
      const selectedLanguage = event.target.value;
      localStorage.setItem('customLanguage', selectedLanguage);
    });

  });

  // 连接 WebSocket
  function connectWebSocket(token, collectorId, apiUrl) {
    if (socket && socket.connected) {
      console.log('已连接服务，不要重复连接');
      return;
    }

    // 断开之前的连接（如果有）
    disconnectWebSocket();

    // 验证输入信息是否完整
    if (!token || !collectorId || !apiUrl) {
      alert('请填写完整的信息');
      return;
    }

    // 连接 Socket.IO 服务
    socket = io.connect(`wss://${apiUrl}`, {
      query: `collectorId=${collectorId}&token=${token}`,
    });

    // 连接成功事件
    socket.on('connect', () => {
      console.log('服务已连接成功');
      updateStatusMessage('已成功连接'); // 播报连接成功提示
      updateTagColorsAndContent(); // 在这里调用函数来更新标签的颜色和内容
      socket.emit('subscribe', collectorId);
      // 如果不是用户主动断开连接，则自动重新连接
      if (!isManuallyDisconnected) {
        socket.emit('subscribe', collectorId);
        socket.emit('frontendConnected', collectorId); // 发送连接成功消息给后端，携带 collectorId
        serviceStatus.textContent = '开启成功';
        connectionStatus.textContent = '已连接';
        updateTagColorsAndContent(); // 在这里调用函数来更新标签的颜色和内容
        clearInterval(heartbeatInterval); // 清除之前的心跳定时器
        heartbeatInterval = setInterval(() => {
          socket.emit('heartbeat');
          console.log('发送心跳消息成功');
        }, 30000);

        if (!hasFirstTimeConnected) { // 判断是否首次连接并播报
          let successMessage;

          switch (languageSelect.value) {
            case 'zh-CN':
              successMessage = '已和监控服务连接成功';
              break;
            case 'es':
              successMessage = 'Conexión exitosa con el servicio';
              break;
            case 'en':
              successMessage = 'Successfully connected to the backend server';
              break;
            case 'es-api-female':
              successMessage = 'Conexión exitosa con el servicio';
              break;
            case 'es-api-male':
              successMessage = 'Conexión exitosa con el servicio';
              break;
          }

          // 使用谷歌 TTS 或浏览器内置 TTS 播放连接成功的消息
          let voiceType;
          if (languageSelect.value === 'es-api-female') {
            voiceType = 'es-api-female';
          } else if (languageSelect.value === 'es-api-male') {
            voiceType = 'es-api-male';
          }

          if (voiceType) {
            // 使用谷歌 TTS 播放连接成功的消息
            speak(successMessage, languageSelect.value, voiceType);
          } else {
            // 使用浏览器内置 TTS 播放连接成功的消息
            const utterance = new SpeechSynthesisUtterance(successMessage);
            utterance.lang = languageSelect.value;
            speechSynthesis.speak(utterance);
          }

          // 标记为已首次连接播报
          hasFirstTimeConnected = true;
        }

        // 输出已加入的房间列表
        // console.log('已加入的房间列表:', socket.rooms);

        // 更新心跳状态的函数
        function updateHeartbeatStatus(status) {
          const heartbeatStatusElement = document.getElementById('HeartbeatStatus');
          heartbeatStatusElement.textContent = status;
          updateTagColorsAndContent(); // 在这里调用函数来更新标签的颜色和内容
        }

        // 监听从后端发送的心跳状态更新
        socket.on('heartbeatStatusUpdate', (status) => {
          updateHeartbeatStatus(status);
          console.log(status)
        });

        socket.on('heartbeat', (data, callback) => {
          callback({ alive: true });
        });


      } else {
        // 如果用户断开后重新连接，恢复状态
        updateStatusMessage('已自动重连成功'); // 播报连接成功提示
        serviceStatus.textContent = '开启成功';
        connectionStatus.textContent = '已连接';
        heartbeatStatusElement.textContent = '未知';
        isManuallyDisconnected = false; // 重置为 false
        updateTagColorsAndContent(); // 在这里调用函数来更新标签的颜色和内容
        clearInterval(heartbeatInterval); // 清除之前的心跳定时器
        heartbeatInterval = setInterval(() => {
          socket.emit('heartbeat');
          console.log('发送心跳消息成功');
        }, 30000);
        // ... (其他操作)

      }
    });


    // 更新心跳状态的函数
    function updateHeartbeatStatus(status) {
      const heartbeatStatusElement = document.getElementById('HeartbeatStatus');
      heartbeatStatusElement.textContent = status;
      updateTagColorsAndContent(); // 在这里调用函数来更新标签的颜色和内容
    }

    // 监听从后端发送的心跳状态更新
    socket.on('heartbeatStatusUpdate', (status) => {
      updateHeartbeatStatus(status);
      console.log(status)
    });

    socket.on('heartbeat', (data, callback) => {
      callback({ alive: true });
    });

    const reportedTransactionIds = new Set(); // 用于追踪已报告的交易

    socket.on('paymentNotification', async (notificationsJson) => {
      try {
        const notification = JSON.parse(notificationsJson);
        console.log('收到交易信息:', notification);

        const notifications = Array.isArray(notification) ? notification : [notification];
        const promises = notifications.map(payment => processPaymentNotification(payment));
        await Promise.all(promises);

      } catch (error) {
        console.error('处理支付通知时出错:', error);
      }
    });

    // 处理支付失败通知
    socket.on('paymentFailureNotification', function(notificationsJson) {
      // 如果复选框未选中，不处理通知
      if (!isListeningForFailures) return;
      
      handlePaymentFailureNotification(notificationsJson);
  });
  
  async function handlePaymentFailureNotification(notificationsJson) {
      try {
        const notification = JSON.parse(notificationsJson);
        console.log('收到支付失败通知:', notification);
    
        const notifications = Array.isArray(notification) ? notification : [notification];
        const promises = notifications.map(payment => processPaymentNotification(payment));
        await Promise.all(promises);
      } catch (error) {
          console.error('处理支付失败通知时出错:', error);
      }
  }

    // 处理退款通知
    socket.on('chargebackNotification', (data) => {
      console.log('收到退款通知:', data);
      // 在此处更新UI或执行其他操作
      processNotificationData(data, '退款');
    });

    async function processPaymentNotification(payment) {
      try {
        if (reportedTransactionIds.has(payment.transaction_id)) {
          console.log('已播报过该交易编号:', payment.transaction_id);
          return;
        }

        const lang = languageSelect.value;
        console.log('lang:', lang);
        const amount = parseFloat(payment.amount).toFixed(2);
        const status = getStatusInChinese(payment.status);

        const transactionTime = new Date(payment.transaction_time);
        const formattedTime = formatDate(transactionTime);

        transactionStatus.textContent = status;
        transactionAmount.textContent = amount;
        transactionId1.textContent = payment.transaction_id;
        transactionTime1.textContent = formattedTime;

        const voiceType = voiceSelector.value;
        const textToSpeak = getNotificationText(payment, lang, voiceType);
        await speak(textToSpeak, lang, voiceType);

        reportedTransactionIds.add(payment.transaction_id);
        console.log('收到支付通知:', payment);

        socket.emit('paymentAck', payment.transaction_id);

      } catch (error) {
        console.error('处理支付通知中的一项时出错:', error);
      }
    }

    //收到支付确定
    socket.on('paymentConfirmation', (transactionId) => {
      console.log(`已收到服务器对支付ID ${transactionId} 的确认`);
    });

    function formatDate(date) {
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();
      return `${day < 10 ? '0' : ''}${day}/${month < 10 ? '0' : ''}${month}/${year} ${hours}:${minutes}:${seconds}`;
    }


    // 监听连接断开事件
    socket.on('disconnect', () => {
      console.log('服务连接已关闭');

      if (isManuallyDisconnected) {
        // 用户主动断开连接的逻辑
        alert('服务连接已关闭');
        serviceStatus.textContent = '未知';
        connectionStatus.textContent = '未连接';
        heartbeatStatusElement.textContent = '未知';
        updateTagColorsAndContent(); // 在这里调用函数来更新标签的颜色和内容
        clearInterval(heartbeatInterval);
        isManuallyDisconnected = false; // 重置为 false
        hasPlayedNotification = false; // 重新连接时重置为未播报状态
        updateStatusMessage('服务连接已关闭');
        clearTimeout(reconnectTimeout); // 清除自动重新连接的定时器
        // 阻止自动重新连接
        socket.disconnect();
      } else {
        // 自动重新连接的逻辑
        console.log('服务连接已关闭，自动重新连接');
        updateStatusMessage('自动重新连接中...');
        // 在断开连接后添加一些延迟以避免立即重连
        reconnectTimeout = setTimeout(() => {
          // 确保之前的 socket 实例不为 null
          if (socket) {
            socket.connect(); // 重新连接
          }
        }, 2000); // 2秒延迟
      }
    });


    // ... 其他事件处理 ...
  }

  // 断开 WebSocket 连接
  function disconnectWebSocket() {
    if (socket) {
      socket.disconnect();
      console.log('服务连接已关闭');
      serviceStatus.textContent = '未知';
      connectionStatus.textContent = '未连接';
      heartbeatStatusElement.textContent = '未知';
      updateTagColorsAndContent(); // 在这里调用函数来更新标签的颜色和内容
      clearInterval(heartbeatInterval);
      socket = null;
    }
  }

  // 清除交易信息显示
  function clearTransactionInfo() {
    transactionStatus.textContent = '未知';
    transactionAmount.textContent = '未知';
    transactionId1.textContent = '未知';
    transactionTime1.textContent = '未知';
  }

  // 获取状态的中文描述
  function getStatusInChinese(status) {
    switch (status) {
      case 'approved':
        return '已批准';
      case 'pending':
        return '待处理';
      case 'rejected':
        return '已拒绝';
      default:
        return status;
    }
  }
  //多语言状态
  const statusDescriptions = {
    "zh-CN": {
      "paid": "已支付",
      "pending": "待支付",
      "failed": "支付失败",
      // ...其他状态
    },
    "en": {
      "paid": "Paid",
      "pending": "Pending",
      "failed": "Failed",
      // ...其他状态
    },
    "es": {
      "paid": "Pagado",
      "pending": "Pendiente",
      "failed": "Fallido",
      // ...其他状态
    },
    // ...其他语言
  };
  //获取

  //转换
  function getBaseLang(langWithVoiceType) {
    return langWithVoiceType.split('-')[0];
  }

  function getStatusDescription(status, langWithVoiceType) {
    const [baseLang] = langWithVoiceType.split('-');
    return statusDescriptions[baseLang] && statusDescriptions[baseLang][status] || status;
  }



  //数字本地化
  function formatNumberToLocale(value, lang) {
    const intValue = parseInt(value);
    if (value === intValue) {
      return new Intl.NumberFormat(lang).format(intValue);
    } else {
      return new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }
  }


  // 获取基本语言代码
  function getBaseLang(langWithVoiceType) {
    return langWithVoiceType.split('-')[0];
  }

  const defaultCustomTextTemplates = {
    "es": "Recibió un nuevo pago de {amount} pesos",
    "es-api-female": "Recibió un nuevo pago de {amount} pesos",
    "es-api-male": "Recibió un nuevo pago de {amount} pesos",
    "en": "Received payment of {amount}",
    "zh-CN": "您有新的交易，金额为 {amount} 比索"
  };

  function getNotificationText(payment, langWithVoiceType) {
    const amount = formatNumberToLocale(parseFloat(payment.amount), langWithVoiceType.split('-')[0]);
    const transactionTime = new Date(payment.transaction_time);

    const day = transactionTime.getDate();
    const month = transactionTime.getMonth() + 1;
    const year = transactionTime.getFullYear();
    const hours = transactionTime.getHours();
    const minutes = transactionTime.getMinutes();
    const seconds = transactionTime.getSeconds();
    const formattedTime = `${day < 10 ? '0' : ''}${day}/${month < 10 ? '0' : ''}${month}/${year} ${hours}:${minutes}:${seconds}`;

    const status = getStatusDescription(payment.status, langWithVoiceType.split('-')[0]);

    // 根据支付状态生成不同的文本
    let notificationText = '';

    if (payment.status === 'rejected') {
      switch (langWithVoiceType) {
        case 'es':
        case 'es-api-female':
        case 'es-api-male':
            notificationText = `Su transacción de ${amount} pesos ha sido rechazada`;
            break;
        case 'en':
            notificationText = `Your transaction of ${amount} has been rejected`;
            break;
        case 'zh-CN':
            notificationText = `您的交易 ${amount} 比索被拒绝`;
            break;
        default:
            notificationText = `您的交易 ${amount} 比索被拒绝`; // 默认情况下，为空字符串
      }
    } else {
        // 获取正确的localStorage键名
        const notificationTemplateKey = `customNotification_${langWithVoiceType}`;

        // 尝试从localStorage获取自定义文本
        let notificationTemplate = localStorage.getItem(notificationTemplateKey);

        if (!notificationTemplate) {
          console.error(`No custom template found for key: ${notificationTemplateKey}`);
          return "您还未设置播报文本请到播报设置中查看";
        }

        // 使用文本模板并替换占位符
        notificationText = notificationTemplate.replace("{amount}", amount)
          .replace("{time}", formattedTime)
          .replace("{status}", status)
          .replace("{id}", payment.transaction_id); // Assuming there is an 'id' field in the payment object.
    }

    return notificationText;
}

  // 播报通知
  async function speak(text, lang, voiceType) {
    console.log("调试：准备播放文本：", text); // 输出文本参数
    console.log("调试：语言设置：", lang); // 输出语言参数

    if (voiceType === "es-api-male") {
      // 使用 Google Cloud TTS API 合成并播放男声语音
      const apiKey = "AIzaSyBCXU_kjFHL1XjyR4xICWRTmOLpksI8Spc"; // 替换为你的 Google Cloud API 密钥
      const apiUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

      const requestData = {
        input: { text: text },
        voice: { languageCode: "es-ES", name: "es-ES-Standard-B" }, // 替换为男声语音参数
        audioConfig: { audioEncoding: "MP3" } // 替换为你需要的音频格式
      };

      // 发送 POST 请求到 Google Cloud TTS API
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestData)
      });

      // 解析返回的 JSON 数据
      const responseBody = await response.json();

      // 获取音频数据并播放
      const audioData = responseBody.audioContent;
      const audioBlob = new Blob([new Uint8Array(atob(audioData).split("").map(char => char.charCodeAt(0)))], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } else if (voiceType === "es-api-female") {
      // 使用 Google Cloud TTS API 合成并播放女声语音
      const apiKey = "AIzaSyBCXU_kjFHL1XjyR4xICWRTmOLpksI8Spc"; // 替换为你的 Google Cloud API 密钥
      const apiUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

      const requestData = {
        input: { text: text },
        voice: { languageCode: "es-ES", name: "es-ES-Standard-C" }, // 替换为女声语音参数
        audioConfig: { audioEncoding: "MP3" } // 替换为你需要的音频格式
      };

      // 发送 POST 请求到 Google Cloud TTS API
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestData)
      });

      // 解析返回的 JSON 数据
      const responseBody = await response.json();

      // 获取音频数据并播放
      const audioData = responseBody.audioContent;
      const audioBlob = new Blob([new Uint8Array(atob(audioData).split("").map(char => char.charCodeAt(0)))], { type: "audio/mpeg" });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } else {
      // 使用浏览器内置 TTS 播放默认声音
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      speechSynthesis.speak(utterance);
    }
  }

  updateCustomNotificationText("zh-CN");

  // 监听声音选项的选择变化
  const voiceSelector = document.getElementById("languageSelect");
  voiceSelector.addEventListener("change", function () {
    const selectedOption = voiceSelector.value;

    if (selectedOption === "zh-CN" || selectedOption === "es" || selectedOption === "en") {
      // 播放对应语言的声音示例
      if (selectedOption === "zh-CN") {
        // speak("zh-CN", "default");
      } else if (selectedOption === "es") {
        // speak("es", "default");
      } else if (selectedOption === "en") {
        // speak("en", "default");
      }
    } else if (selectedOption === "es-api-female") {
      // speak("es", "es-api-female");
    } else if (selectedOption === "es-api-male") {
      // speak("es", "es-api-male");
    }
  });

  // 当语言选择改变时，更新播报内容文本
  document.getElementById("customLanguageSelect").addEventListener("change", function () {
    const selectedOption = this.value;
    updateCustomNotificationText(selectedOption);
  });

  // 当用户点击保存设置时，将选中语言的播报内容保存到 localStorage
  document.getElementById("saveSettingsButton").addEventListener("click", function () {
    const selectedLanguage = document.getElementById("customLanguageSelect").value;
    const customText = document.getElementById("customNotificationText").value;
    localStorage.setItem(`customNotification_${selectedLanguage}`, customText);
    alert('设置已保存！');
  });

  function updateCustomNotificationText(language) {
    // 从 localStorage 中读取对应语言的自定义文本
    const savedCustomNotification = localStorage.getItem(`customNotification_${language}`);

    // 检查对应语言的自定义文本是否存在于 localStorage 中
    if (savedCustomNotification) {
      document.getElementById("customNotificationText").value = savedCustomNotification;
    } else if (defaultCustomTextTemplates && defaultCustomTextTemplates[language]) {
      document.getElementById("customNotificationText").value = defaultCustomTextTemplates[language];
    } else {
      document.getElementById("customNotificationText").value = "";
    }
  }

  // 默认载入中文播报内容
  // updateCustomNotificationText("zh-CN");


  //播报参数
  const parameterButtons = document.querySelectorAll('.parameter-button');
  const customNotificationText = document.getElementById("customNotificationText");

  parameterButtons.forEach(button => {
    button.addEventListener('click', () => {
      const parameter = button.getAttribute('data-parameter');

      if (customNotificationText.value.includes(parameter)) {
        // 如果参数已经存在于输入框中，则移除它
        customNotificationText.value = customNotificationText.value.replace(parameter, '');
        button.classList.remove('selected');
      } else {
        // 否则，添加参数到输入框中
        customNotificationText.value += parameter;
        button.classList.add('selected');
      }
    });
  });

  // 开始按钮点击事件
  startButton.addEventListener('click', () => {
    const token = tokenInput.value;
    const collectorId = collectorIdInput.value;
    const apiUrl = apiUrlInput.value;
    connectWebSocket(token, collectorId, apiUrl);
  });

  // 停止按钮点击事件
  stopButton.addEventListener('click', () => {
    disconnectWebSocket();
    clearTransactionInfo();
    isManuallyDisconnected = true; // 用户主动断开连接
    clearTimeout(reconnectTimeout); // 清除自动重新连接的定时器
    updateStatusMessage('已停止监控');
  });


  console.log('脚本加载完成');
});
