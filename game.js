(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const lobbyScreen = $("#lobby-screen");
  const gameScreen = $("#game-screen");
  const connectionStatus = $("#connection-status");
  const canvas = $("#game-canvas");
  const ctx = canvas.getContext("2d");
  const ARENA = { width: 1000, height: 500, floor: 430 };
  const keys = new Set();

  const AUGMENTS = [
    { id: "burst", name: "점사", description: "한 번에 3발 발사 · 탄창 +3 · 피해 50% 감소 · 재장전 +0.2초" },
    { id: "giantBullet", name: "거대탄환", description: "탄환 크기 +50% · 탄속 -30% · 재장전 +0.3초" },
    { id: "tank", name: "탱크", description: "최대 체력 +100% · 피해 20% 감소 · 재장전 +0.2초" },
    { id: "vampire", name: "흡혈탄환", description: "피해량의 20% 회복 · 피해 30% 감소" },
    { id: "spray", name: "스프레이", description: "한 번에 10발 발사 · 탄창 10배 · 피해 90% 감소 · 재장전 +0.1초" },
    { id: "homing", name: "유도탄", description: "탄환이 적을 향해 방향을 보정 · 재장전 +0.2초 · 피해 20% 감소" },
    { id: "sniper", name: "스나이퍼", description: "사거리 +400% · 피해 +100% · 재장전 +0.5초" },
    { id: "poison", name: "독성탄환", description: "피해 30% 감소 · 5초간 매초 탄환 피해의 15% 지속 피해" },
    { id: "berserker", name: "버서커", description: "체력 비율이 낮을수록 피해와 재장전 속도 증가" },
    { id: "ricochet", name: "탄성탄환", description: "벽에서 한 번 튕김 · 튕길 때마다 피해 10% 감소 · 탄속 -10%" },
    { id: "comeback", name: "대기만성", description: "멈춰 있으면 집중 · 이동 시 10초간 피해와 탄속 증가 (최대 5초 충전)" },
    { id: "rapid", name: "고속 사격", description: "탄속 +100% · 공격 간격 +25% · 재장전 +0.2초" },
    { id: "freeze", name: "빙결 탄환", description: "피격 대상 이동속도 50% 감소" },
    { id: "giant", name: "거대화", description: "최대 체력 +40% · 이동속도 -20%" },
    { id: "brawler", name: "싸움꾼", description: "피해를 입히면 3초간 최대 체력 2배" },
    { id: "fastForward", name: "빨리감기", description: "탄속 +60% · 재장전 시간 -20%" },
    { id: "flash", name: "눈부심", description: "피격 대상 1.5초 기절 · 재장전 +0.2초" },
    { id: "explosive", name: "폭발탄환", description: "명중 피해의 30% 추가 폭발 피해 · 재장전 +0.2초 · 탄속 -20%" },
    { id: "reflect", name: "반사", description: "상대 탄환을 맞히면 상대에게 탄환 피해의 50% 반사 · 재장전 +0.2초 · 공격 간격 +0.1초 · 탄창 -2" },
    { id: "lastShot", name: "최후의 한 발", description: "탄창의 마지막 탄환 피해 +25%" }
  ];

  let peerConnection = null;
  let dataChannel = null;
  let isHost = false;
  let connected = false;
  let localPlayer = 0;
  let peerReady = false;
  let hostReady = false;
  let localReady = false;
  let currentRoomName = "";
  let hostRoomPassword = "";
  let pendingRoom = null;
  let firebaseApp = null;
  let firebaseAuth = null;
  let firebaseDatabase = null;
  let currentRoomRef = null;
  let answerListener = null;
  let offerCode = "";
  let leavingGame = false;
  let game = null;
  let lastFrame = 0;
  let lastSnapshot = 0;
  let lastInputSend = 0;
  let toastTimer = 0;
  let audioEnabled = true;
  let audioContext = null;
  let countdownShownFor = 0;
  let pointer = { x: 500, y: 250 };

  function defaultStats() {
    return { damage: 18, bulletSize: 5, ammo: 12, bulletSpeed: 675, gravity: 300, range: 620, reload: 1.2, maxHp: 100, attackSpeed: 0.32, moveSpeed: 255, jump: 390, bulletCount: 1, ammoCost: 1, bulletsPerMagazine: 12, reloadFactor: 1, damageFactor: 1, speedFactor: 1, sizeFactor: 1, rangeFactor: 1, attackFactor: 1, tankStacks: 0, giantStacks: 0, burstStacks: 0, sprayStacks: 0, ricochetStacks: 0, augmentCounts: {}, augmentNames: [], poisonStacks: 0, freezeStacks: 0, flashStacks: 0, explosiveStacks: 0, vampireStacks: 0, reflectStacks: 0, lastShotStacks: 0, brawlerStacks: 0, berserkerStacks: 0, comebackStacks: 0, homingStacks: 0 };
  }

  function makePlayer(id, name) {
    const stats = defaultStats();
    return {
      id, name, x: id === 0 ? 145 : 855, y: ARENA.floor - 58, vx: 0, vy: 0, hp: stats.maxHp, maxHp: stats.maxHp,
      ammo: stats.bulletsPerMagazine, stats, facing: id === 0 ? 1 : -1, grounded: true, crouching: false,
      blockUntil: 0, stunUntil: 0, slowUntil: 0, slowFactor: 1, lastDamageAt: 0, lastShotAt: 0,
      reloadUntil: 0, charging: 0, chargeUntil: 0, chargeFactor: 1, brawlerUntil: 0, input: emptyInput(),
      kills: 0, roundWins: 0
    };
  }

  function emptyInput() {
    return { left: false, right: false, down: false, up: false, jump: false, fire: false, block: false, reload: false, aimX: 500, aimY: 250 };
  }

  function freshGame() {
    const players = [makePlayer(0, "PLAYER 01"), makePlayer(1, "PLAYER 02")];
    return {
      players, bullets: [], particles: [], round: 1, bout: 1, boutWins: [0, 0], totalRounds: [0, 0],
      phase: "ready", winner: null, augmentTarget: null, augmentChoices: [], startedAt: 0, lastTick: Date.now(),
      message: "", terrain: [
        { x: 0, y: 430 }, { x: 250, y: 430 }, { x: 278, y: 352 }, { x: 306, y: 430 },
        { x: 694, y: 430 }, { x: 722, y: 350 }, { x: 750, y: 430 }, { x: 1000, y: 430 }
      ]
    };
  }

  function showToast(message, error = false) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.remove("hidden");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.add("hidden"), 3200);
  }

  function setStatus(message) {
    connectionStatus.textContent = message;
  }

  function getFirebaseServices() {
    if (!window.firebase || !window.firebaseConfig || !window.firebaseConfig.databaseURL) {
      throw new Error("Firebase SDK 또는 프로젝트 설정을 불러오지 못했습니다. 인터넷 연결과 firebase-config.js를 확인해 주세요.");
    }
    if (!firebaseApp) firebaseApp = firebase.initializeApp(window.firebaseConfig);
    if (!firebaseAuth) firebaseAuth = firebase.auth();
    if (!firebaseDatabase) firebaseDatabase = firebase.database();
    return { auth: firebaseAuth, database: firebaseDatabase };
  }

  async function authenticateFirebase() {
    const { auth } = getFirebaseServices();
    if (auth.currentUser) return auth.currentUser;
    const credential = await auth.signInAnonymously();
    if (!credential.user) throw new Error("Firebase 익명 로그인을 완료하지 못했습니다.");
    return credential.user;
  }

  function generateRoomCode() {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const randomBytes = new Uint8Array(8);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes, (byte) => characters[byte % characters.length]).join("");
  }

  async function waitForIceGathering() {
    if (peerConnection.iceGatheringState === "complete") return;
    await new Promise((resolve, reject) => {
      const onStateChange = () => {
        if (peerConnection.iceGatheringState !== "complete") return;
        window.clearTimeout(timeout);
        peerConnection.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      };
      const timeout = window.setTimeout(() => {
        peerConnection.removeEventListener("icegatheringstatechange", onStateChange);
        reject(new Error("LAN 연결 정보 수집 시간이 초과되었습니다. 다시 시도해 주세요."));
      }, 15000);
      peerConnection.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  function createPeerConnection() {
    if (!window.RTCPeerConnection) throw new Error("이 브라우저는 WebRTC P2P 연결을 지원하지 않습니다.");
    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peerConnection.addEventListener("connectionstatechange", () => {
      if (peerConnection?.connectionState === "failed" && !leavingGame) {
        const message = "P2P 연결에 실패했습니다. 네트워크 방화벽 설정을 확인해 주세요.";
        setStatus(message);
        showToast(message, true);
      }
    });
  }

  function attachDataChannel(channel) {
    dataChannel = channel;
    channel.addEventListener("open", () => {
      if (isHost) {
        $("#network-label").textContent = "P2P 채널 열림 · 인증 대기";
        return;
      }
      game = freshGame();
      $("#player-one-name").textContent = "PLAYER 01";
      $("#player-two-name").textContent = "PLAYER 02 · YOU";
      $("#network-label").textContent = "P2P 채널 열림 · 방장 인증 중";
      enterGame();
      channel.send(JSON.stringify({ type: "hello", password: hostRoomPassword }));
    });
    channel.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (isHost) handleHostMessage(message);
        else handleGuestMessage(message);
      } catch (error) {
        console.error("Unable to read a P2P message.", error);
        showToast("상대에게서 잘못된 연결 데이터를 받았습니다.", true);
      }
    });
    channel.addEventListener("close", () => {
      if (!leavingGame) handleDisconnect();
    });
    channel.addEventListener("error", (event) => {
      console.error("P2P data channel error.", event);
      showToast("상대와의 P2P 연결에서 오류가 발생했습니다.", true);
    });
  }

  async function openHost(password) {
    try {
      isHost = true;
      localPlayer = 0;
      hostRoomPassword = password;
      currentRoomName = "도전자 #" + Math.floor(1000 + Math.random() * 9000);
      connected = false;
      game = freshGame();
      $("#create-room").disabled = true;
      setStatus("Firebase에 연결하고 방 코드를 만드는 중…");
      const { database } = getFirebaseServices();
      const user = await authenticateFirebase();
      createPeerConnection();
      attachDataChannel(peerConnection.createDataChannel("void-duel", { ordered: true }));
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGathering();
      let roomCreated = false;
      for (let attempt = 0; attempt < 5 && !roomCreated; attempt++) {
        offerCode = generateRoomCode();
        const roomRef = database.ref(`rooms/${offerCode}`);
        const result = await roomRef.transaction((existingRoom) => existingRoom === null ? {
          hostUid: user.uid,
          offer: { type: peerConnection.localDescription.type, sdp: peerConnection.localDescription.sdp },
          createdAt: Date.now()
        } : undefined);
        if (result.committed) {
          currentRoomRef = roomRef;
          roomCreated = true;
        }
      }
      if (!roomCreated) throw new Error("방 코드를 만들지 못했습니다. 다시 시도해 주세요.");
      await currentRoomRef.onDisconnect().remove();
      answerListener = (snapshot) => {
        const answer = snapshot.val();
        if (!answer || answer.uid === user.uid || answer.type !== "answer" || typeof answer.sdp !== "string" ||
            !peerConnection || peerConnection.remoteDescription) return;
        currentRoomRef.child("answer").off("value", answerListener);
        peerConnection.setRemoteDescription({ type: answer.type, sdp: answer.sdp }).catch((error) => {
          console.error("Unable to apply the guest WebRTC answer.", error);
          showConnectionError(error);
        });
      };
      currentRoomRef.child("answer").on("value", answerListener, (error) => {
        console.error("Unable to listen for a guest WebRTC answer.", error);
        showConnectionError(error);
      });
      $("#player-one-name").textContent = "PLAYER 01 · HOST";
      $("#player-two-name").textContent = "PLAYER 02";
      $("#network-label").textContent = `방 코드 ${offerCode}`;
      setStatus(`방이 준비되었습니다. 8자리 코드 ${offerCode}를 공유하세요.`);
      enterGame();
      $("#arena-overlay h2").textContent = "ROOM OPEN";
      $("#arena-overlay p").textContent = "상대가 8자리 코드를 입력하면 자동으로 연결됩니다.";
      $("#ready-button").textContent = "전투 준비 →";
      $("#show-signal").classList.remove("hidden");
      openSignalModal("host");
    } catch (error) {
      console.error("Unable to create a Firebase room.", error);
      showConnectionError(error);
      closePeerConnection();
      await cleanupRoom();
      $("#create-room").disabled = false;
    }
  }

  async function joinRoom(code, password = "") {
    try {
      const cleanCode = code.trim().toUpperCase();
      if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(cleanCode)) {
        throw new Error("방 코드는 영문 대문자와 숫자로 된 8자리입니다.");
      }
      isHost = false;
      localPlayer = 1;
      hostRoomPassword = password;
      connected = false;
      setStatus("방 코드를 확인하고 연결하는 중…");
      $("#join-room").disabled = true;
      const { database } = getFirebaseServices();
      const user = await authenticateFirebase();
      const roomRef = database.ref(`rooms/${cleanCode}`);
      const snapshot = await roomRef.once("value");
      const room = snapshot.val();
      if (!room || !room.offer || typeof room.offer.sdp !== "string") {
        throw new Error("방을 찾을 수 없습니다. 코드를 확인해 주세요.");
      }
      if (!Number.isFinite(room.createdAt) || Date.now() - room.createdAt > 10 * 60 * 1000) {
        if (room.hostUid && firebaseAuth.currentUser.uid !== room.hostUid) {
          roomRef.remove().catch((error) => console.error("Unable to remove the expired Firebase room.", error));
        }
        throw new Error("방 코드가 만료되었습니다. 방장에게 새 코드를 요청해 주세요.");
      }
      if (room.answer) throw new Error("이미 다른 플레이어가 입장한 방입니다.");
      createPeerConnection();
      await peerConnection.setRemoteDescription(room.offer);
      peerConnection.addEventListener("datachannel", (event) => attachDataChannel(event.channel), { once: true });
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await waitForIceGathering();
      await roomRef.child("answer").set({
        uid: user.uid,
        type: peerConnection.localDescription.type,
        sdp: peerConnection.localDescription.sdp
      });
      setStatus("방장과 P2P 연결을 맺는 중…");
    } catch (error) {
      console.error("Unable to join the Firebase room.", error);
      showConnectionError(error);
      closePeerConnection();
    } finally {
      $("#join-room").disabled = false;
    }
  }

  async function cleanupRoom() {
    if (answerListener && currentRoomRef) currentRoomRef.child("answer").off("value", answerListener);
    answerListener = null;
    if (!currentRoomRef) return;
    const roomRef = currentRoomRef;
    currentRoomRef = null;
    try {
      await roomRef.onDisconnect().cancel();
    } catch (error) {
      console.error("Unable to cancel Firebase room cleanup.", error);
    }
    try {
      await roomRef.remove();
    } catch (error) {
      console.error("Unable to remove the Firebase room.", error);
      showToast("Firebase 방 정리에 실패했습니다.", true);
    }
  }

  function showConnectionError(error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast(message, true);
    setStatus(message);
  }

  function closePeerConnection() {
    const wasLeaving = leavingGame;
    leavingGame = true;
    if (dataChannel && dataChannel.readyState !== "closed") dataChannel.close();
    if (peerConnection && peerConnection.signalingState !== "closed") peerConnection.close();
    dataChannel = null;
    peerConnection = null;
    leavingGame = wasLeaving;
  }

  function openSignalModal() {
    $("#signal-modal").classList.remove("hidden");
    $("#signal-title").textContent = "방 코드";
    $("#signal-description").textContent = "이 8자리 코드를 상대 플레이어에게 알려주세요. 상대가 입력하면 연결됩니다.";
    $("#signal-code-label").textContent = "친구에게 공유";
    $("#signal-code").value = offerCode;
    $("#signal-code").readOnly = true;
    $("#signal-copy").textContent = "방 코드 복사";
  }

  function enterGame() {
    lobbyScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    $("#arena-overlay").classList.remove("hidden");
    $("#ready-button").disabled = false;
    draw();
  }

  function returnToLobby() {
    leavingGame = true;
    closePeerConnection();
    cleanupRoom();
    game = null;
    connected = false;
    localReady = false;
    hostReady = false;
    peerReady = false;
    isHost = false;
    offerCode = "";
    hostRoomPassword = "";
    $("#create-room").disabled = false;
    $("#join-room").disabled = false;
    $("#show-signal").classList.add("hidden");
    $("#signal-modal").classList.add("hidden");
    $("#augment-modal").classList.add("hidden");
    gameScreen.classList.add("hidden");
    lobbyScreen.classList.remove("hidden");
    setStatus("Firebase 방 코드로 연결할 수 있습니다");
    leavingGame = false;
  }

  function handleDisconnect() {
    connected = false;
    $("#network-label").textContent = "상대 연결 끊김";
    $("#arena-overlay").classList.remove("hidden");
    $("#arena-overlay h2").textContent = "CONNECTION LOST";
    $("#arena-overlay p").textContent = "상대와의 연결이 끊겼습니다. 대기실로 돌아가 주세요.";
    $("#ready-button").classList.add("hidden");
    showToast("상대방의 연결이 끊겼습니다.", true);
  }

  function send(message) {
    if (dataChannel && dataChannel.readyState === "open") dataChannel.send(JSON.stringify(message));
  }

  function handleHostMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "hello") {
      if (hostRoomPassword && message.password !== hostRoomPassword) {
        send({ type: "error", message: "비밀번호가 올바르지 않습니다." });
        dataChannel.close();
        return;
      }
      connected = true;
      game.players[1].name = "PLAYER 02";
      $("#arena-overlay h2").textContent = "OPPONENT FOUND";
      $("#arena-overlay p").textContent = "두 플레이어가 준비되면 전투가 시작됩니다.";
      $("#network-label").textContent = "P2P 연결됨 · 호스트";
      $("#player-two-name").textContent = "PLAYER 02 · CONNECTED";
      $("#show-signal").classList.add("hidden");
      $("#signal-modal").classList.add("hidden");
      setStatus("상대와 P2P로 연결되었습니다");
      send({ type: "welcome", roomName: currentRoomName });
      cleanupRoom();
      broadcastState();
      updateHud();
      showToast("상대가 대기실에 입장했습니다.");
    } else if (message.type === "ready") {
      peerReady = Boolean(message.value);
      checkStart();
    } else if (message.type === "input" && message.input && game) {
      game.players[1].input = sanitizeInput(message.input);
    } else if (message.type === "augment" && game && game.phase === "augment" && game.augmentTarget === 1) {
      chooseAugment(1, message.index);
    }
  }

  function handleGuestMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "error") {
      showToast(message.message || "방에 입장할 수 없습니다.", true);
      if (dataChannel) dataChannel.close();
    } else if (message.type === "welcome") {
      connected = true;
      $("#network-label").textContent = `P2P 연결됨 · ${message.roomName || "상대방"}`;
      setStatus("상대와 P2P로 연결되었습니다");
      $("#show-signal").classList.add("hidden");
      $("#signal-modal").classList.add("hidden");
    } else if (message.type === "state" && message.game) {
      game = message.game;
      connected = true;
      renderPhase();
      if (game.phase === "countdown") showCountdown();
      updateHud();
      draw();
    }
  }

  function sanitizeInput(input) {
    return {
      left: Boolean(input.left), right: Boolean(input.right), down: Boolean(input.down), up: Boolean(input.up),
      jump: Boolean(input.jump), fire: Boolean(input.fire), block: Boolean(input.block), reload: Boolean(input.reload),
      aimX: clamp(Number(input.aimX) || 500, 0, ARENA.width), aimY: clamp(Number(input.aimY) || 250, 0, ARENA.height)
    };
  }

  function checkStart() {
    if (!isHost || !game || game.phase !== "ready") return;
    if (!connected || !hostReady || !peerReady) {
      renderPhase();
      return;
    }
    game.phase = "countdown";
    game.startedAt = Date.now() + 3000;
    game.players.forEach((player) => { player.hp = player.maxHp; player.ammo = player.stats.bulletsPerMagazine; });
    broadcastState();
    renderPhase();
    showCountdown();
  }

  function showCountdown() {
    const counter = $("#countdown");
    if (countdownShownFor === game.startedAt) return;
    countdownShownFor = game.startedAt;
    counter.classList.remove("hidden");
    const tick = () => {
      if (!game || game.phase !== "countdown") {
        counter.classList.add("hidden");
        return;
      }
      const remaining = Math.ceil((game.startedAt - Date.now()) / 1000);
      if (remaining <= 0) {
        counter.classList.add("hidden");
        if (isHost) {
          game.phase = "play";
          game.lastTick = Date.now();
          broadcastState();
          renderPhase();
        }
        return;
      }
      counter.textContent = String(remaining);
      window.setTimeout(tick, 200);
    };
    tick();
  }

  function readyUp() {
    if (!connected) {
      showToast("먼저 상대방이 입장해야 합니다.", true);
      return;
    }
    localReady = !localReady;
    $("#ready-button").textContent = localReady ? "준비 완료 ✓" : "전투 준비 →";
    $("#arena-overlay p").textContent = localReady ? "상대방이 준비할 때까지 기다리는 중…" : "준비 상태를 취소했습니다.";
    if (isHost) {
      hostReady = localReady;
      checkStart();
    } else {
      send({ type: "ready", value: localReady });
    }
  }

  function makeInput() {
    const player = game?.players[localPlayer];
    const rect = canvas.getBoundingClientRect();
    const scaleX = ARENA.width / rect.width;
    const scaleY = ARENA.height / rect.height;
    return {
      left: keys.has("a"), right: keys.has("d"), down: keys.has("s"), up: keys.has("w"),
      jump: keys.has(" "), fire: pointer.down, block: pointer.right, reload: keys.has("r"),
      aimX: clamp((pointer.x - rect.left) * scaleX, 0, ARENA.width),
      aimY: clamp((pointer.y - rect.top) * scaleY, 0, ARENA.height)
    };
  }

  function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);
    if (!game || gameScreen.classList.contains("hidden")) return;
    const now = Date.now();
    if (!isHost) {
      if (connected && now - lastInputSend > 33) {
        send({ type: "input", input: makeInput() });
        lastInputSend = now;
      }
      draw();
      return;
    }
    const delta = Math.min((timestamp - (lastFrame || timestamp)) / 1000, 0.04);
    lastFrame = timestamp;
    if (game.phase === "play") updateGame(delta, now);
    updateHud();
    if (now - lastSnapshot > 60) {
      broadcastState();
      lastSnapshot = now;
    }
    draw();
  }

  function updateGame(dt, now) {
    for (const player of game.players) {
      if (player.id === 0) player.input = sanitizeInput(makeInput());
      updatePlayer(player, dt, now);
    }
    updateBullets(dt, now);
    updateParticles(dt);
    if (game.players.some((player) => player.hp <= 0)) finishBout();
  }

  function updatePlayer(player, dt, now) {
    const input = player.input;
    const stats = player.stats;
    const stunned = now < player.stunUntil;
    player.crouching = input.down;
    const maxSpeed = stats.moveSpeed * (now < player.slowUntil ? player.slowFactor : 1);
    const moving = !stunned && (input.left || input.right);
    if (moving) {
      player.vx = (input.left ? -1 : 1) * maxSpeed;
      player.facing = input.left ? -1 : 1;
      if (player.charging > 0) {
        player.chargeFactor = 1 + Math.min(player.charging, 5) * 0.2 * stats.comebackStacks;
        player.charging = 0;
        player.chargeUntil = now + 10000;
      }
    } else {
      player.vx *= Math.pow(0.001, dt);
      if (!stunned && stats.comebackStacks) player.charging = Math.min(5, player.charging + dt);
    }
    if (input.jump && player.grounded && !input.down && !stunned) {
      player.vy = -stats.jump;
      player.grounded = false;
    }
    const playerHeight = player.crouching ? 29 : 58;
    player.vy += (input.down ? 1250 : 760) * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 18, ARENA.width - 18);
    const floor = groundAt(player.x);
    if (player.y + playerHeight >= floor) {
      player.y = floor - playerHeight;
      player.vy = 0;
      player.grounded = true;
    } else player.grounded = false;
    if (input.up && (input.left || input.right)) {
      const slope = slopeAt(player.x + (input.right ? 22 : -22));
      if (slope > 2.75 && slope < 5.67) {
        player.x += (input.right ? 1 : -1) * maxSpeed * dt * 0.75;
        player.y -= maxSpeed * dt * 0.75;
      }
    }
    if (input.block && !stunned && now >= player.blockUntil) player.blockUntil = now + 500;
    if (input.reload && now >= player.reloadUntil && player.ammo < stats.bulletsPerMagazine) {
      player.reloadUntil = now + stats.reload * stats.reloadFactor * 1000;
    }
    if (player.reloadUntil && now >= player.reloadUntil) {
      player.ammo = stats.bulletsPerMagazine;
      player.reloadUntil = 0;
    }
    if (input.fire && !stunned) fire(player, now);
    if (stats.brawlerStacks) {
      const boostedMaxHp = stats.maxHp * (now < player.brawlerUntil ? 2 ** stats.brawlerStacks : 1);
      if (player.maxHp !== boostedMaxHp) {
        player.maxHp = boostedMaxHp;
        player.hp = Math.min(player.hp, player.maxHp);
      }
    }
    if (player.hp < player.maxHp && now - player.lastDamageAt >= 3000) {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * dt * 0.05);
    }
  }

  function groundAt(x) {
    const terrain = game.terrain;
    for (let i = 0; i < terrain.length - 1; i++) {
      const a = terrain[i], b = terrain[i + 1];
      if (x >= a.x && x <= b.x) return a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x));
    }
    return ARENA.floor;
  }

  function slopeAt(x) {
    const terrain = game.terrain;
    for (let i = 0; i < terrain.length - 1; i++) {
      const a = terrain[i], b = terrain[i + 1];
      if (x >= a.x && x <= b.x) return Math.abs((b.y - a.y) / (b.x - a.x));
    }
    return 0;
  }

  function playerDamage(player, now, finalShot = false) {
    const missingPercent = 1 - player.hp / player.maxHp;
    let damage = player.stats.damage * player.stats.damageFactor;
    damage *= 1 + player.stats.berserkerStacks * missingPercent;
    if (player.stats.berserkerStacks) player.stats.reloadFactor = Math.max(0.35, 1 - missingPercent * 0.2 * player.stats.berserkerStacks);
    if (player.stats.brawlerStacks && now < player.brawlerUntil) damage *= 1.1 ** player.stats.brawlerStacks;
    if (player.stats.comebackStacks && now < player.chargeUntil) damage *= player.chargeFactor;
    if (finalShot && player.stats.lastShotStacks) damage *= 1.25 ** player.stats.lastShotStacks;
    return damage;
  }

  function fire(player, now) {
    const stats = player.stats;
    if (player.reloadUntil || now - player.lastShotAt < stats.attackSpeed * stats.attackFactor * 1000) return;
    if (player.ammo < stats.ammoCost) {
      player.reloadUntil = now + stats.reload * stats.reloadFactor * 1000;
      return;
    }
    player.lastShotAt = now;
    player.ammo -= stats.ammoCost;
    const target = game.players[1 - player.id];
    const startX = player.x + player.facing * 23;
    const startY = player.y + (player.crouching ? 15 : 28);
    const dx = player.input.aimX - startX;
    const dy = player.input.aimY - startY;
    const baseAngle = Math.atan2(dy, dx);
    const bulletCount = stats.bulletCount;
    const damage = playerDamage(player, now, player.ammo === 0);
    for (let i = 0; i < bulletCount; i++) {
      const spread = bulletCount > 1 ? (i - (bulletCount - 1) / 2) * Math.min(0.11, 0.025 + bulletCount * 0.002) : 0;
      const angle = baseAngle + spread;
      game.bullets.push({
        owner: player.id, x: startX, y: startY, vx: Math.cos(angle) * stats.bulletSpeed * stats.speedFactor * (now < player.chargeUntil ? player.chargeFactor : 1),
        vy: Math.sin(angle) * stats.bulletSpeed * stats.speedFactor * (now < player.chargeUntil ? player.chargeFactor : 1),
        damage, size: stats.bulletSize * stats.sizeFactor, gravity: stats.gravity, range: stats.range * stats.rangeFactor,
        traveled: 0, born: now, ricochets: stats.ricochetStacks ? 1 : 0, poison: stats.poisonStacks,
        freeze: stats.freezeStacks, flash: stats.flashStacks, explosive: stats.explosiveStacks,
        vampire: stats.vampireStacks, homing: stats.homingStacks, reflected: false
      });
    }
    playTone(180, 0.045, "square");
    if (player.ammo === 0) player.reloadUntil = now + stats.reload * stats.reloadFactor * 1000;
  }

  function updateBullets(dt, now) {
    const keep = [];
    for (const bullet of game.bullets) {
      const target = game.players[1 - bullet.owner];
      if (bullet.homing && target.hp > 0) {
        const dx = target.x - bullet.x, dy = target.y + 25 - bullet.y;
        const targetAngle = Math.atan2(dy, dx), angle = Math.atan2(bullet.vy, bullet.vx);
        const diff = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
        const corrected = angle + clamp(diff, -0.9 * dt, 0.9 * dt);
        const speed = Math.hypot(bullet.vx, bullet.vy);
        bullet.vx = Math.cos(corrected) * speed;
        bullet.vy = Math.sin(corrected) * speed;
      }
      const oldX = bullet.x, oldY = bullet.y;
      bullet.vy += bullet.gravity * dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.traveled += Math.hypot(bullet.x - oldX, bullet.y - oldY);
      const against = game.players[1 - bullet.owner];
      const height = against.crouching ? 29 : 58;
      if (bullet.x >= against.x - 17 && bullet.x <= against.x + 17 && bullet.y >= against.y && bullet.y <= against.y + height) {
        let damage = bullet.damage * (now < against.blockUntil ? 0.05 : 1);
        if (now < against.blockUntil) spawnParticles(bullet.x, bullet.y, "#53e0dc", 3);
        else {
          if (bullet.poison) against.poisonedUntil = now + 5000;
          if (bullet.poison) against.poisonDamage = bullet.damage * 0.15 * bullet.poison;
          if (bullet.freeze) { against.slowUntil = now + 2500; against.slowFactor = 0.5 ** bullet.freeze; }
          if (bullet.flash) against.stunUntil = Math.max(against.stunUntil, now + 1500 * bullet.flash);
          if (bullet.explosive) damage *= 1 + 0.3 * bullet.explosive;
          if (bullet.vampire) game.players[bullet.owner].hp = Math.min(game.players[bullet.owner].maxHp, game.players[bullet.owner].hp + damage * 0.2 * bullet.vampire);
          if (game.players[bullet.owner].stats.brawlerStacks) {
            const source = game.players[bullet.owner];
            source.maxHp = source.stats.maxHp * (2 ** source.stats.brawlerStacks);
            source.hp = Math.min(source.maxHp, source.hp + source.stats.maxHp * 0.02);
            source.brawlerUntil = now + 3000;
          }
        }
        against.hp -= damage;
        against.lastDamageAt = now;
        spawnParticles(bullet.x, bullet.y, against.id === 0 ? "#56b9ff" : "#ff637d", 8);
        playTone(90, 0.08, "sawtooth");
        continue;
      }
      let hitBullet = false;
      for (const other of game.bullets) {
        if (other.owner === bullet.owner || other === bullet) continue;
        if (Math.hypot(other.x - bullet.x, other.y - bullet.y) < other.size + bullet.size) {
          if (bullet.reflected || other.reflected) continue;
          if (game.players[bullet.owner].stats.reflectStacks) {
            game.players[1 - bullet.owner].hp -= other.damage * 0.5 * game.players[bullet.owner].stats.reflectStacks;
            game.players[1 - bullet.owner].lastDamageAt = now;
          }
          if (game.players[other.owner].stats.reflectStacks) {
            game.players[1 - other.owner].hp -= bullet.damage * 0.5 * game.players[other.owner].stats.reflectStacks;
            game.players[1 - other.owner].lastDamageAt = now;
          }
          bullet.reflected = other.reflected = true;
          hitBullet = true;
          break;
        }
      }
      if (hitBullet) continue;
      const floor = groundAt(bullet.x);
      if (bullet.y >= floor - 2 || bullet.x <= 0 || bullet.x >= ARENA.width || bullet.y < 0) {
        if (bullet.ricochets > 0 && bullet.x > 0 && bullet.x < ARENA.width && bullet.y >= floor - 2) {
          bullet.vy = -Math.abs(bullet.vy) * 0.85;
          bullet.damage *= 0.9;
          bullet.ricochets--;
          bullet.y = floor - 3;
        } else continue;
      }
      if (bullet.traveled < bullet.range && now - bullet.born < 6000) keep.push(bullet);
    }
    game.bullets = keep;
    for (const player of game.players) {
      if (player.poisonedUntil && now < player.poisonedUntil && now - (player.lastPoisonTick || 0) >= 1000) {
        player.hp -= player.poisonDamage || 0;
        player.lastDamageAt = now;
        player.lastPoisonTick = now;
      }
    }
  }

  function finishBout() {
    const loser = game.players.find((player) => player.hp <= 0);
    if (!loser) return;
    const winner = 1 - loser.id;
    game.boutWins[winner]++;
    game.players[winner].kills++;
    game.phase = "boutOver";
    game.bullets = [];
    game.message = `${game.players[winner].name} 승리`;
    if (game.boutWins[winner] >= 2 || game.bout >= 3) {
      game.totalRounds[winner]++;
      game.players.forEach((player) => { player.roundWins = game.totalRounds[player.id]; });
      if (game.round >= 7) {
        game.phase = "finished";
        game.winner = game.totalRounds[0] > game.totalRounds[1] ? 0 : 1;
        game.message = `${game.players[game.winner].name} 최종 승리!`;
      } else {
        game.phase = "augment";
        game.augmentTarget = loser.id;
        game.augmentChoices = pickAugments();
        game.message = `${game.players[loser.id].name} 증강 선택`;
      }
    } else {
      game.bout++;
      game.phase = "boutBreak";
      game.startedAt = nowPlus(2200);
    }
    broadcastState();
    renderPhase();
  }

  function nowPlus(ms) { return Date.now() + ms; }

  function pickAugments() {
    const pool = [...AUGMENTS];
    const result = [];
    while (result.length < 3) {
      const index = Math.floor(Math.random() * pool.length);
      result.push(pool.splice(index, 1)[0]);
    }
    return result;
  }

  function renderPhase() {
    if (!game) return;
    const overlay = $("#arena-overlay");
    const modal = $("#augment-modal");
    modal.classList.add("hidden");
    if (game.phase === "ready") {
      overlay.classList.remove("hidden");
      $("#ready-button").classList.remove("hidden");
      $("#arena-overlay h2").textContent = connected ? "OPPONENT FOUND" : "ROOM OPEN";
      $("#arena-overlay p").textContent = connected ? "두 플레이어가 준비되면 전투가 시작됩니다." : "상대가 8자리 방 코드를 입력하면 연결됩니다.";
    } else if (game.phase === "play" || game.phase === "countdown") {
      overlay.classList.add("hidden");
    } else if (game.phase === "augment") {
      overlay.classList.add("hidden");
      if (game.augmentTarget === localPlayer) showAugmentChoices();
      else {
        overlay.classList.remove("hidden");
        $("#ready-button").classList.add("hidden");
        $("#arena-overlay h2").textContent = "AUGMENTING";
        $("#arena-overlay p").textContent = `${game.players[game.augmentTarget].name} 증강 선택 중…`;
      }
    } else {
      overlay.classList.remove("hidden");
      $("#ready-button").classList.add("hidden");
      $("#arena-overlay h2").textContent = game.message || "ROUND OVER";
      $("#arena-overlay p").textContent = game.phase === "finished" ? "7라운드 대결이 종료되었습니다." : game.phase === "boutBreak" ? "다음 판을 준비하세요." : "다음 라운드로 이동합니다.";
      if (game.phase === "boutOver") window.setTimeout(() => {
        if (!game || game.phase !== "boutBreak") return;
        startNextBout();
      }, 700);
      if (game.phase === "boutBreak" && isHost) scheduleBoutStart();
      if (game.phase === "finished") $("#arena-overlay h2").textContent = game.message;
    }
    $("#round-label").textContent = `ROUND ${String(game.round).padStart(2, "0")} / 07`;
    $("#bout-label").textContent = `BOUT ${game.bout} / 3`;
    updateHud();
  }

  let breakTimer = null;
  function scheduleBoutStart() {
    if (breakTimer) window.clearTimeout(breakTimer);
    const wait = Math.max(0, game.startedAt - Date.now());
    breakTimer = window.setTimeout(startNextBout, wait);
  }

  function startNextBout() {
    if (!isHost || !game || game.phase !== "boutBreak") return;
    resetPlayersForBout();
    game.phase = "play";
    game.message = "";
    broadcastState();
    renderPhase();
  }

  function resetPlayersForBout() {
    game.players.forEach((player) => {
      player.x = player.id === 0 ? 145 : 855;
      player.y = ARENA.floor - 58;
      player.vx = player.vy = 0;
      player.hp = player.maxHp;
      player.ammo = player.stats.bulletsPerMagazine;
      player.reloadUntil = player.blockUntil = player.stunUntil = player.slowUntil = 0;
      player.brawlerUntil = player.chargeUntil = 0;
      player.charging = 0;
      player.lastDamageAt = Date.now();
    });
    game.bullets = [];
  }

  function showAugmentChoices() {
    const options = $("#augment-options");
    options.replaceChildren(...game.augmentChoices.map((augment, index) => {
      const button = document.createElement("button");
      button.className = "augment-card";
      button.innerHTML = `<span class="aug-index">AUGMENT 0${index + 1}</span><strong></strong><small></small>`;
      button.querySelector("strong").textContent = augment.name;
      button.querySelector("small").textContent = augment.description;
      button.addEventListener("click", () => {
        if (isHost) chooseAugment(localPlayer, index);
        else send({ type: "augment", index });
        $("#augment-modal").classList.add("hidden");
      });
      return button;
    }));
    $("#augment-modal").classList.remove("hidden");
  }

  function chooseAugment(playerId, index) {
    if (!isHost || !game || game.phase !== "augment" || game.augmentTarget !== playerId || !Number.isInteger(index)) return;
    const augment = game.augmentChoices[index];
    if (!augment) return;
    applyAugment(game.players[playerId], augment.id);
    game.players.forEach((player) => {
      player.x = player.id === 0 ? 145 : 855;
      player.y = ARENA.floor - 58;
      player.vx = player.vy = 0;
      player.hp = player.maxHp;
      player.ammo = player.stats.bulletsPerMagazine;
      player.lastDamageAt = Date.now();
    });
    game.round++;
    game.bout = 1;
    game.boutWins = [0, 0];
    game.bullets = [];
    game.phase = "play";
    game.message = "";
    game.augmentTarget = null;
    game.augmentChoices = [];
    broadcastState();
    renderPhase();
    showToast(`${augment.name} 증강을 획득했습니다.`);
  }

  function applyAugment(player, id) {
    const s = player.stats;
    s.augmentCounts[id] = (s.augmentCounts[id] || 0) + 1;
    const count = s.augmentCounts[id];
    const augment = AUGMENTS.find((item) => item.id === id);
    if (augment) s.augmentNames.push(augment.name);
    switch (id) {
      case "burst": s.burstStacks++; s.bulletCount += 2; s.ammoCost += 2; s.bulletsPerMagazine += 3; s.damageFactor *= 0.5; s.reload += 0.2; break;
      case "giantBullet": s.sizeFactor *= 1.5; s.speedFactor *= 0.7; s.reload += 0.3; break;
      case "tank": s.tankStacks++; s.maxHp *= 2; s.damageFactor *= 0.8; s.reload += 0.2; player.maxHp = s.maxHp; player.hp = Math.min(player.hp * 2, player.maxHp); break;
      case "vampire": s.vampireStacks++; s.damageFactor *= 0.7; break;
      case "spray": s.sprayStacks++; s.bulletCount += 9; s.ammoCost += 9; s.bulletsPerMagazine *= 10; s.damageFactor *= 0.1; s.reload += 0.1; break;
      case "homing": s.homingStacks++; s.reload += 0.2; s.damageFactor *= 0.8; break;
      case "sniper": s.rangeFactor *= 5; s.damageFactor *= 2; s.reload += 0.5; break;
      case "poison": s.poisonStacks++; s.damageFactor *= 0.7; break;
      case "berserker": s.berserkerStacks++; break;
      case "ricochet": s.ricochetStacks++; s.speedFactor *= 0.9; break;
      case "comeback": s.comebackStacks++; break;
      case "rapid": s.speedFactor *= 2; s.attackFactor *= 1.25; s.reload += 0.2; break;
      case "freeze": s.freezeStacks++; break;
      case "giant": s.giantStacks++; s.maxHp *= 1.4; s.moveSpeed *= 0.8; player.maxHp = s.maxHp; player.hp = Math.min(player.hp * 1.4, player.maxHp); break;
      case "brawler": s.brawlerStacks++; break;
      case "fastForward": s.speedFactor *= 1.6; s.reloadFactor *= 0.8; break;
      case "flash": s.flashStacks++; s.reload += 0.2; break;
      case "explosive": s.explosiveStacks++; s.reload += 0.2; s.speedFactor *= 0.8; break;
      case "reflect": s.reflectStacks++; s.reload += 0.2; s.attackSpeed += 0.1; s.bulletsPerMagazine = Math.max(1, s.bulletsPerMagazine - 2); player.ammo = Math.min(player.ammo, s.bulletsPerMagazine); break;
      case "lastShot": s.lastShotStacks++; break;
      default: throw new Error(`Unknown augment: ${id}`);
    }
    player.maxHp = s.maxHp;
    player.hp = Math.min(player.hp, player.maxHp);
    updateHud();
  }

  function updateHud() {
    if (!game) return;
    for (const id of [0, 1]) {
      const player = game.players[id];
      const n = id + 1;
      $(`#health-${id === 0 ? "one" : "two"}`).style.width = `${clamp(player.hp / player.maxHp * 100, 0, 100)}%`;
      $(`#hp-${id === 0 ? "one" : "two"}`).textContent = Math.max(0, Math.ceil(player.hp));
      $(`#ammo-${id === 0 ? "one" : "two"}`).textContent = `${player.ammo} / ${player.stats.bulletsPerMagazine}`;
      $(`#wins-${id === 0 ? "one" : "two"}`).textContent = game.totalRounds[id];
      $(`#player-${id === 0 ? "one" : "two"}-state`).textContent = Date.now() < player.stunUntil ? "STUNNED" : Date.now() < player.blockUntil ? "BLOCK" : player.reloadUntil ? "RELOAD" : "READY";
      const build = $(`#build-${id === 0 ? "one" : "two"} span`);
      const augmentSummary = player.stats.augmentNames.join(" · ") || "증강 없음";
      if (build) {
        if (build.textContent !== augmentSummary) build.textContent = augmentSummary;
        build.title = augmentSummary;
      }
    }
    $("#round-label").textContent = `ROUND ${String(game.round).padStart(2, "0")} / 07`;
    $("#bout-label").textContent = `BOUT ${game.bout} / 3 · ${game.boutWins[0]}—${game.boutWins[1]}`;
  }

  function broadcastState() {
    if (isHost && connected && game) send({ type: "state", game });
  }

  function draw() {
    if (!game || !ctx) return;
    ctx.clearRect(0, 0, ARENA.width, ARENA.height);
    drawTerrain();
    for (const player of game.players) drawPlayer(player);
    for (const bullet of game.bullets) drawBullet(bullet);
    for (const particle of game.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    const input = makeInput();
    const player = game.players[localPlayer];
    if (player && game.phase === "play") drawAim(input.aimX, input.aimY);
  }

  function drawTerrain() {
    const terrain = game.terrain;
    ctx.beginPath();
    ctx.moveTo(0, ARENA.height);
    for (const point of terrain) ctx.lineTo(point.x, point.y);
    ctx.lineTo(ARENA.width, ARENA.height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 350, 0, ARENA.height);
    gradient.addColorStop(0, "#152331");
    gradient.addColorStop(1, "#0b111b");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    terrain.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = "#5f8790";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#53e0dc";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#516476";
    ctx.font = "9px 'IBM Plex Mono'";
    ctx.fillText("ARENA 01 // THE FRACTURE", 16, 24);
  }

  function drawPlayer(player) {
    const crouch = player.crouching ? 29 : 58;
    const color = player.id === 0 ? "#56b9ff" : "#ff637d";
    const dark = player.id === 0 ? "#123149" : "#451c2a";
    const x = player.x, y = player.y;
    ctx.save();
    ctx.fillStyle = "#03070b88";
    ctx.beginPath();
    ctx.ellipse(x, groundAt(x) + 2, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (Date.now() < player.blockUntil) {
      ctx.strokeStyle = "#63e5dc";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y + crouch / 2, 34, -Math.PI * 0.65, Math.PI * 0.65);
      ctx.stroke();
    }
    ctx.fillStyle = dark;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 14, y + crouch);
    ctx.lineTo(x - 11, y + 20);
    ctx.lineTo(x - 8, y + 8);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x + 10, y + 10);
    ctx.lineTo(x + 14, y + crouch);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + 1, 8, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x + player.facing * 5 - 3, y - 1, player.facing * 10, 2);
    if (Date.now() < player.stunUntil) {
      ctx.fillStyle = "#f1d47a";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText("✦", x - 5, y - 12);
    }
    ctx.restore();
  }

  function drawBullet(bullet) {
    const color = bullet.owner === 0 ? "#7bcfff" : "#ff8799";
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = bullet.size;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(bullet.x - bullet.vx * 0.025, bullet.y - bullet.vy * 0.025);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, Math.max(2, bullet.size * 0.48), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAim(x, y) {
    ctx.save();
    ctx.strokeStyle = "#e3f1f2aa";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.moveTo(x - 11, y); ctx.lineTo(x - 4, y);
    ctx.moveTo(x + 4, y); ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 11);
    ctx.stroke();
    ctx.restore();
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 120;
      game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, life: 0.35, maxLife: 0.35 });
    }
  }

  function updateParticles(dt) {
    game.particles = game.particles.filter((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 200 * dt;
      particle.life -= dt;
      return particle.life > 0;
    });
  }

  function playTone(frequency, duration, type) {
    if (!audioEnabled) return;
    try {
      audioContext ||= new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      console.error("Unable to play sound.", error);
      audioEnabled = false;
    }
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  $("#create-room").addEventListener("click", () => {
    pendingRoom = { mode: "create" };
    $("#password-modal").classList.remove("hidden");
    $("#room-password").value = "";
    $("#room-password").placeholder = "방 비밀번호 (선택)";
    $(".password-card h2").textContent = "대기실 만들기";
    $(".password-card p").textContent = "비밀번호는 선택 사항입니다. 초대 코드로 입장한 상대에게 필요합니다.";
    $("#password-form .primary-button").innerHTML = '방 생성하기 <span>→</span>';
    $("#room-password").type = "password";
    $("#room-password").focus();
  });
  $("#join-room").addEventListener("click", () => {
    const code = $("#join-code").value.trim();
    if (!code) return showToast("초대 코드를 입력해 주세요.", true);
    pendingRoom = { mode: "join", code };
    $("#password-modal").classList.remove("hidden");
    $("#room-password").value = "";
    $("#room-password").placeholder = "방 비밀번호 (없으면 비워두세요)";
    $(".password-card h2").textContent = "초대 코드로 입장";
    $(".password-card p").textContent = "방장이 비밀번호를 설정했다면 입력해 주세요.";
    $("#password-form .primary-button").innerHTML = '입장하기 <span>→</span>';
    $("#room-password").type = "password";
  });
  $("#password-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const password = $("#room-password").value;
    $("#password-modal").classList.add("hidden");
    if (pendingRoom?.mode === "create") openHostWithPassword(password);
    else if (pendingRoom?.mode === "join") joinRoom(pendingRoom.code, password);
    pendingRoom = null;
  });
  function openHostWithPassword(password) {
    openHost(password);
  }
  $("#close-password").addEventListener("click", () => {
    $("#password-modal").classList.add("hidden");
    pendingRoom = null;
  });
  $("#password-modal").addEventListener("click", (event) => {
    if (event.target === $("#password-modal")) $("#password-modal").classList.add("hidden");
  });
  $("#signal-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(offerCode);
      showToast("방 코드를 복사했습니다.");
    } catch (error) {
      const field = $("#signal-code");
      field.focus();
      field.select();
      showToast("코드를 선택했습니다. 복사해 전달해 주세요.", true);
      console.error("Unable to copy the Firebase room code to the clipboard.", error);
    }
  });
  $("#close-signal").addEventListener("click", () => $("#signal-modal").classList.add("hidden"));
  $("#signal-modal").addEventListener("click", (event) => {
    if (event.target === $("#signal-modal")) $("#signal-modal").classList.add("hidden");
  });
  $("#show-signal").addEventListener("click", () => {
    if (offerCode) openSignalModal();
  });
  $("#ready-button").addEventListener("click", readyUp);
  $("#leave-game").addEventListener("click", returnToLobby);
  $("#sound-button").addEventListener("click", () => {
    audioEnabled = !audioEnabled;
    $("#sound-button").style.color = audioEnabled ? "" : "#ff637d";
    $("#sound-button").textContent = audioEnabled ? "♫" : "♪";
  });
  const joinCodeInput = $("#join-code");
  joinCodeInput.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const physicalKey = event.code.match(/^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/);
    if (!physicalKey) return;
    const character = physicalKey[1] || physicalKey[2] || physicalKey[3];
    event.preventDefault();
    joinCodeInput.setRangeText(character, joinCodeInput.selectionStart, joinCodeInput.selectionEnd, "end");
    joinCodeInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  joinCodeInput.addEventListener("input", (event) => {
    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(start, end);
  });
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    if (["a", "d", "s", "w", "r", " "].includes(key)) {
      keys.add(key);
      if (key === " " || ["a", "d", "s", "w"].includes(key)) event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => { keys.clear(); pointer.down = false; pointer.right = false; });
  canvas.addEventListener("pointermove", (event) => { pointer.x = event.clientX; pointer.y = event.clientY; });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button === 0) pointer.down = true;
    if (event.button === 2) pointer.right = true;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.button === 0) pointer.down = false;
    if (event.button === 2) pointer.right = false;
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  requestAnimationFrame(gameLoop);
})();