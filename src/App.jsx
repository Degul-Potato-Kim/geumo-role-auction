import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// 1. Firebase 콘솔에서 웹앱을 만든 뒤, 아래 값을 본인 프로젝트 값으로 바꾸세요.
// 2. 값을 넣지 않으면 이 앱은 현재 기기 안에서만 작동하는 '로컬 미리보기 모드'로 실행됩니다.
const firebaseConfig = {
  apiKey: "AIzaSyD4p-5-k3ic_XbBcGUSQ_NAXQt0JKfZW6E",
  authDomain: "degul-potato-kim.firebaseapp.com",
  projectId: "degul-potato-kim",
  storageBucket: "degul-potato-kim.firebasestorage.app",
  messagingSenderId: "44280045508",
  appId: "1:44280045508:web:07efae6f2d6263290cce91",
  measurementId: "G-WKL7EVFZ8J"
};

const CLASS_CODE = "geumo-6-4";
const DEFAULT_TIME_LIMIT = 60;

const JOBS = [
  { name: "환경미화원", count: 3, role: "하교 후 1, 2, 3분단 하나씩 맡아서 먼지쓸기(청소)", timing: "하교 후(월, 수, 금)" },
  { name: "깔끔이", count: 1, role: "휴지통 주변 청소", timing: "필요할 때" },
  { name: "보드게임 관리인", count: 1, role: "보드게임 관리 일지 작성 및 관리하기", timing: "매일" },
  { name: "기자", count: 1, role: "학급 소식 기사 쓰기", timing: "2주에 한 번" },
  { name: "파트라슈", count: 3, role: "아침에 우유 가져오고 갖다놓기, 우유 나눠주기", timing: "매일" },
  { name: "문지기", count: 2, role: "매 수업 시작하면 출입문 닫기", timing: "쉬는 시간" },
  { name: "분리수거", count: 3, role: "점심시간에 분리배출하기", timing: "일주일에 한 번" },
  { name: "시간표 바꾸기", count: 1, role: "다음날 칠판 시간표 바꾸기 - 아침, 집가기 전 선택", timing: "매일" },
  { name: "지우개", count: 1, role: "쉬는 시간에 칠판 지우기, 칠판 지우개 빨기", timing: "쉬는 시간" },
  { name: "나눔이", count: 2, role: "한 줄씩 담당해서 안내장 주기", timing: "필요할 때" },
  { name: "꼬마선생님", count: 2, role: "친구들에게 모르는 공부 알려주기", timing: "필요할 때" },
  { name: "타이머", count: 1, role: "쉬는 시간 타이머 맞추기", timing: "매시간" },
  { name: "문구점 관리인", count: 2, role: "점심시간, 쉬는 시간 학급 문구점 운영하기", timing: "쉬는 시간, 점심시간" },
  { name: "줄줄이", count: 1, role: "이동할 때 빠르게 줄 서도록 돕고 인원 수 체크하기", timing: "이동할 때" },
];

function Icon({ children, className = "" }) {
  return <span aria-hidden="true" className={`inline-flex h-5 w-5 items-center justify-center text-base leading-none ${className}`}>{children}</span>;
}

function shuffleArray(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function rankBids(bids) {
  return [...bids].sort((a, b) => a.amount - b.amount || a.createdAt - b.createdAt);
}

function pickWinners(bids, count) {
  return rankBids(bids).slice(0, count);
}

function getQueryMode() {
  if (typeof window === "undefined") return "teacher";
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "student" ? "student" : "teacher";
}

function isFirebaseReady() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

function createInitialRoomState() {
  return {
    queue: shuffleArray(JOBS),
    currentIndex: 0,
    auctionOpen: false,
    timeLimit: DEFAULT_TIME_LIMIT,
    startedAt: null,
    roundId: "ready",
    message: "교사가 '역할 배정 시작'을 누르면 랜덤 역할 경매가 시작됩니다.",
    updatedAt: Date.now(),
  };
}

let firebaseCache = null;
function getFirebase() {
  if (!isFirebaseReady()) return null;
  if (firebaseCache) return firebaseCache;
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  firebaseCache = { app, db };
  return firebaseCache;
}

function normalizeBidDoc(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    student: data.student,
    amount: Number(data.amount),
    createdAt: Number(data.createdAt || 0),
  };
}

function getQrImageUrl(url) {
  if (!url) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=16&data=${encodeURIComponent(url)}`;
}

function runSelfTests() {
  const sampleBids = [
    { student: "가", amount: 500, createdAt: 3 },
    { student: "나", amount: 300, createdAt: 2 },
    { student: "다", amount: 300, createdAt: 1 },
    { student: "라", amount: 1000, createdAt: 4 },
  ];
  const ranked = rankBids(sampleBids);
  console.assert(ranked[0].student === "다", "동일 금액이면 먼저 제출한 학생이 앞서야 합니다.");
  console.assert(ranked[1].student === "나", "낮은 금액 순으로 정렬되어야 합니다.");
  const picked = pickWinners(sampleBids, 2);
  console.assert(picked.length === 2, "모집 인원만큼 선정되어야 합니다.");
  console.assert(picked[0].student === "다" && picked[1].student === "나", "최저가 학생부터 선정되어야 합니다.");
  const shuffled = shuffleArray(JOBS);
  console.assert(shuffled.length === JOBS.length, "역할 섞기 후에도 역할 개수는 유지되어야 합니다.");
  console.assert(new Set(shuffled.map((job) => job.name)).size === JOBS.length, "역할 섞기 후에도 중복이나 누락이 없어야 합니다.");
  console.assert(getRemainingSeconds({ auctionOpen: false }) === 0, "경매가 닫혀 있으면 남은 시간은 0초여야 합니다.");
  console.assert(createInitialRoomState().queue.length === JOBS.length, "초기 방에는 모든 역할이 있어야 합니다.");
  console.assert(getQrImageUrl("https://example.com?mode=student").includes(encodeURIComponent("https://example.com?mode=student")), "QR 코드 URL에는 학생용 주소가 인코딩되어 들어가야 합니다.");
}
runSelfTests();

function getRemainingSeconds(room) {
  if (!room?.auctionOpen || !room.startedAt) return 0;
  const start = typeof room.startedAt === "number" ? room.startedAt : room.startedAt?.toMillis?.() || 0;
  if (!start) return Number(room.timeLimit || DEFAULT_TIME_LIMIT);
  const elapsed = Math.floor((Date.now() - start) / 1000);
  return Math.max(0, Number(room.timeLimit || DEFAULT_TIME_LIMIT) - elapsed);
}

export default function OnePersonOneRoleAuction() {
  const firebase = getFirebase();
  const firebaseEnabled = Boolean(firebase);
  const roomRef = firebaseEnabled ? doc(firebase.db, "roleAuctionRooms", CLASS_CODE) : null;

  const [mode, setMode] = useState(getQueryMode);
  const [room, setRoom] = useState(createInitialRoomState);
  const [bids, setBids] = useState([]);
  const [winners, setWinners] = useState([]);
  const [studentName, setStudentName] = useState(() => localStorage.getItem("roleAuctionStudentName") || "");
  const [bidAmount, setBidAmount] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(DEFAULT_TIME_LIMIT);

  const currentJob = room.queue?.[room.currentIndex];
  const completed = room.currentIndex >= (room.queue?.length || 0);
  const sortedBids = useMemo(() => rankBids(bids), [bids]);
  const currentJobHasWinner = currentJob ? winners.some((winner) => winner.job === currentJob.name) : false;
  const alreadyAssigned = winners.some((winner) => winner.student === studentName.trim());

  useEffect(() => {
    if (!firebaseEnabled || !roomRef) return;
    const unsubscribe = onSnapshot(roomRef, async (snapshot) => {
      if (!snapshot.exists()) {
        if (mode === "teacher") await setDoc(roomRef, createInitialRoomState());
        return;
      }
      setRoom(snapshot.data());
    });
    return unsubscribe;
  }, [firebaseEnabled, mode]);

  useEffect(() => {
    if (!firebaseEnabled || !room.roundId) return;
    const bidsRef = collection(firebase.db, "roleAuctionRooms", CLASS_CODE, "rounds", room.roundId, "bids");
    const bidsQuery = query(bidsRef, orderBy("amount", "asc"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(bidsQuery, (snapshot) => {
      setBids(snapshot.docs.map(normalizeBidDoc));
    });
    return unsubscribe;
  }, [firebaseEnabled, room.roundId]);

  useEffect(() => {
    if (!firebaseEnabled) return;
    const winnersRef = collection(firebase.db, "roleAuctionRooms", CLASS_CODE, "winners");
    const unsubscribe = onSnapshot(winnersRef, (snapshot) => {
      setWinners(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    });
    return unsubscribe;
  }, [firebaseEnabled]);

  useEffect(() => {
    localStorage.setItem("roleAuctionStudentName", studentName);
  }, [studentName]);

  useEffect(() => {
    const update = () => setTimeLeft(getRemainingSeconds(room));
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [room]);

  useEffect(() => {
    if (mode !== "teacher" || !room.auctionOpen || timeLeft > 0) return;
    closeAuction();
  }, [mode, room.auctionOpen, timeLeft]);

  const updateRoom = async (next) => {
    if (firebaseEnabled && roomRef) {
      await setDoc(roomRef, { ...next, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      setRoom((prev) => ({ ...prev, ...next, updatedAt: Date.now() }));
    }
  };

  const clearCurrentBids = async (roundId) => {
    if (!firebaseEnabled) {
      setBids([]);
      return;
    }
    const bidsRef = collection(firebase.db, "roleAuctionRooms", CLASS_CODE, "rounds", roundId, "bids");
    const snapshot = await getDocs(bidsRef);
    await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  };

  const resetAll = async () => {
    if (firebaseEnabled) {
      const winnersRef = collection(firebase.db, "roleAuctionRooms", CLASS_CODE, "winners");
      const winnersSnapshot = await getDocs(winnersRef);
      await Promise.all(winnersSnapshot.docs.map((item) => deleteDoc(item.ref)));
      if (room.roundId) await clearCurrentBids(room.roundId);
    } else {
      setBids([]);
      setWinners([]);
    }
    await updateRoom(createInitialRoomState());
    setLocalMessage("처음부터 다시 시작합니다. 역할 순서가 새로 섞였습니다.");
  };

  const startAuction = async () => {
    if (!currentJob || completed || currentJobHasWinner) return;
    const roundId = `${Date.now()}-${room.currentIndex}-${currentJob.name}`;
    await updateRoom({
      auctionOpen: true,
      startedAt: Date.now(),
      roundId,
      message: `'${currentJob.name}' 역할 경매가 시작되었습니다. 학생들은 희망 최저임금을 제시하세요!`,
    });
    setBids([]);
  };

  const submitBid = async () => {
    const trimmedName = studentName.trim();
    const amount = Number(bidAmount);
    if (!room.auctionOpen) {
      setLocalMessage("아직 경매가 열리지 않았습니다.");
      return;
    }
    if (!trimmedName) {
      setLocalMessage("학생 이름을 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setLocalMessage("0보다 큰 임금을 숫자로 입력해 주세요.");
      return;
    }
    if (alreadyAssigned) {
      setLocalMessage("이미 역할을 얻은 학생은 다시 입찰할 수 없습니다.");
      return;
    }

    const bid = { student: trimmedName, amount, createdAt: Date.now() };
    if (firebaseEnabled) {
      const safeName = trimmedName.replace(/[/.#[\]$]/g, "_");
      const bidRef = doc(firebase.db, "roleAuctionRooms", CLASS_CODE, "rounds", room.roundId, "bids", safeName);
      await setDoc(bidRef, bid);
    } else {
      setBids((prev) => [...prev.filter((item) => item.student !== trimmedName), bid]);
    }
    setBidAmount("");
    setLocalMessage(`${trimmedName} 학생의 입찰이 등록되었습니다.`);
  };

  const closeAuction = async () => {
    if (!currentJob || !room.auctionOpen) return;
    let latestBids = bids;
    if (firebaseEnabled) {
      const bidsRef = collection(firebase.db, "roleAuctionRooms", CLASS_CODE, "rounds", room.roundId, "bids");
      const snapshot = await getDocs(bidsRef);
      latestBids = snapshot.docs.map(normalizeBidDoc);
    }
    const selected = pickWinners(latestBids, currentJob.count);
    if (selected.length === 0) {
      await updateRoom({ auctionOpen: false, message: `'${currentJob.name}' 역할에 입찰자가 없어 다시 진행할 수 있습니다.` });
      return;
    }

    if (firebaseEnabled) {
      await runTransaction(firebase.db, async (transaction) => {
        selected.forEach((bid, index) => {
          const winnerId = `${room.currentIndex}-${currentJob.name}-${index}-${bid.student}`.replace(/[/.#[\]$]/g, "_");
          const winnerRef = doc(firebase.db, "roleAuctionRooms", CLASS_CODE, "winners", winnerId);
          transaction.set(winnerRef, {
            job: currentJob.name,
            student: bid.student,
            wage: bid.amount,
            role: currentJob.role,
            timing: currentJob.timing,
            roundId: room.roundId,
            createdAt: Date.now(),
          });
        });
        transaction.set(roomRef, {
          auctionOpen: false,
          message: `'${currentJob.name}' 역할 배정 완료! 최저가 ${selected.length}명이 선정되었습니다.`,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
    } else {
      setWinners((prev) => [
        ...prev.filter((winner) => winner.job !== currentJob.name),
        ...selected.map((bid) => ({
          job: currentJob.name,
          student: bid.student,
          wage: bid.amount,
          role: currentJob.role,
          timing: currentJob.timing,
        })),
      ]);
      await updateRoom({ auctionOpen: false, message: `'${currentJob.name}' 역할 배정 완료! 최저가 ${selected.length}명이 선정되었습니다.` });
    }
  };

  const nextJob = async () => {
    if (room.auctionOpen || !currentJobHasWinner) {
      setLocalMessage("현재 역할을 먼저 마감해 주세요.");
      return;
    }
    await updateRoom({
      currentIndex: room.currentIndex + 1,
      auctionOpen: false,
      roundId: `ready-${Date.now()}`,
      startedAt: null,
      message: "다음 랜덤 역할을 시작할 준비가 되었습니다.",
    });
    setBids([]);
  };

  const reshuffleQueue = async () => {
    if (room.auctionOpen || winners.length > 0) return;
    await updateRoom({ queue: shuffleArray(room.queue || JOBS), message: "아직 배정 전인 역할 순서를 다시 섞었습니다." });
  };

  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}?mode=student`;
  const teacherUrl = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}?mode=teacher`;
  const qrImageUrl = getQrImageUrl(shareUrl);
  const displayMessage = localMessage || room.message;

  const copyStudentLink = async () => {
    if (!shareUrl || typeof navigator === "undefined" || !navigator.clipboard) {
      setLocalMessage("학생용 주소를 직접 복사해 주세요.");
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setLocalMessage("학생용 접속 주소를 복사했습니다.");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-pink-50 to-yellow-50 p-4 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[2rem] bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-pink-500">학급 경제교실 · 실시간 1인 1역 경매</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">우리 반 직업 최저임금 경매장</h1>
              <p className="mt-2 text-sm text-slate-600">학생은 자기 휴대폰으로 입찰하고, 교사 화면에는 실시간으로 반영됩니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setMode("teacher")} variant={mode === "teacher" ? "default" : "outline"} className="rounded-2xl">교사용</Button>
              <Button onClick={() => setMode("student")} variant={mode === "student" ? "default" : "outline"} className="rounded-2xl">학생용</Button>
            </div>
          </div>
        </header>

        {!firebaseEnabled && (
          <Card className="rounded-[2rem] border-0 bg-amber-50 shadow-sm">
            <CardContent className="p-5 text-sm text-amber-900">
              <b>현재는 로컬 미리보기 모드입니다.</b> 학생들이 각자 휴대폰으로 동시에 접속하려면 코드 상단의 <b>firebaseConfig</b> 값을 채워 Firebase Firestore와 연결해야 합니다.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-[2rem] border-0 bg-white/90 shadow-sm">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="text-sky-500">📋</Icon>
                  <h2 className="text-xl font-bold">현재 역할</h2>
                </div>
                <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white">{Math.min(room.currentIndex + 1, room.queue?.length || JOBS.length)} / {room.queue?.length || JOBS.length}</Badge>
              </div>

              <AnimatePresence mode="wait">
                {completed ? (
                  <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-emerald-50 p-6 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl shadow-sm">🏆</div>
                    <h3 className="mt-3 text-2xl font-black">모든 역할 배정 완료!</h3>
                    <p className="mt-2 text-slate-600">아래 결과표를 확인하고 학급 게시용으로 정리하세요.</p>
                  </motion.div>
                ) : (
                  <motion.div key={currentJob?.name || "none"} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">
                    <div className="rounded-3xl bg-gradient-to-r from-sky-100 to-pink-100 p-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-3xl font-black">{currentJob?.name}</h3>
                        <Badge variant="secondary" className="rounded-full text-sm">모집 {currentJob?.count}명</Badge>
                      </div>
                      <p className="mt-4 text-lg font-semibold">{currentJob?.role}</p>
                      <p className="mt-2 text-sm text-slate-600">활동시기: {currentJob?.timing}</p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-3xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">상태</p>
                        <p className="mt-1 text-2xl font-black">{room.auctionOpen ? "입찰 중" : currentJobHasWinner ? "배정 완료" : "대기 중"}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">남은 시간</p>
                        <p className="mt-1 flex items-center text-3xl font-black text-pink-500"><Icon className="mr-2">⏱</Icon> {timeLeft}초</p>
                      </div>
                      <div className="rounded-3xl bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">현재 입찰자</p>
                        <p className="mt-1 flex items-center text-3xl font-black text-sky-500"><Icon className="mr-2">👥</Icon> {bids.length}명</p>
                      </div>
                    </div>

                    {mode === "teacher" && (
                      <div className="space-y-3">
                        <div className="rounded-3xl bg-slate-50 p-4">
                          <p className="text-sm text-slate-500">제한시간 설정</p>
                          <div className="mt-2 flex max-w-xs items-center gap-2">
                            <Input type="number" min="10" value={room.timeLimit || DEFAULT_TIME_LIMIT} onChange={(e) => updateRoom({ timeLimit: Number(e.target.value) || DEFAULT_TIME_LIMIT })} disabled={room.auctionOpen} className="rounded-2xl" />
                            <span className="text-sm">초</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={startAuction} disabled={room.auctionOpen || currentJobHasWinner} className="rounded-2xl bg-slate-900 hover:bg-slate-700">역할 배정 시작</Button>
                          <Button onClick={closeAuction} disabled={!room.auctionOpen} variant="secondary" className="rounded-2xl">지금 마감</Button>
                          <Button onClick={nextJob} disabled={room.auctionOpen || !currentJobHasWinner} variant="outline" className="rounded-2xl">다음 역할</Button>
                          <Button onClick={reshuffleQueue} variant="outline" className="rounded-2xl" disabled={room.auctionOpen || winners.length > 0}>순서 섞기</Button>
                          <Button onClick={resetAll} variant="outline" className="rounded-2xl">처음부터</Button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-0 bg-white/90 shadow-sm">
            <CardContent className="p-6">
              {mode === "teacher" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-bold">학생 접속 QR코드</h2>
                      <p className="mt-1 text-sm text-slate-500">학생들이 휴대폰 카메라로 찍으면 학생용 입찰 화면으로 바로 들어갑니다.</p>
                    </div>
                    <Button onClick={copyStudentLink} variant="outline" className="rounded-2xl">주소 복사</Button>
                  </div>

                  <div className="rounded-[2rem] bg-white p-4 text-center shadow-inner">
                    {qrImageUrl ? (
                      <img src={qrImageUrl} alt="학생 접속용 QR코드" className="mx-auto h-72 w-72 rounded-3xl bg-white p-2" />
                    ) : (
                      <div className="flex h-72 items-center justify-center rounded-3xl bg-slate-50 text-sm text-slate-500">배포 후 QR코드가 표시됩니다.</div>
                    )}
                    <p className="mt-3 text-lg font-black text-pink-500">학생용 QR코드</p>
                    <p className="mt-1 text-xs text-slate-500">QR이 안 보이면 아래 주소를 직접 입력하세요.</p>
                  </div>

                  <div className="rounded-3xl bg-slate-50 p-4 text-sm break-all">
                    <b>학생용:</b> {shareUrl || "배포 후 표시됩니다."}
                  </div>
                  <div className="rounded-3xl bg-slate-50 p-4 text-sm break-all">
                    <b>교사용:</b> {teacherUrl || "배포 후 표시됩니다."}
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-xl font-bold">학생 입찰하기</h2>
                  <p className="mt-1 text-sm text-slate-500">같은 이름으로 다시 제출하면 마지막 금액으로 수정됩니다.</p>
                  <div className="mt-4 space-y-3">
                    <Input placeholder="학생 이름" value={studentName} onChange={(e) => setStudentName(e.target.value)} className="rounded-2xl" />
                    <Input placeholder="희망 최저임금 예: 300" type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} className="rounded-2xl" onKeyDown={(e) => e.key === "Enter" && submitBid()} />
                    <Button onClick={submitBid} disabled={!room.auctionOpen || alreadyAssigned} className="w-full rounded-2xl bg-pink-500 hover:bg-pink-600">입찰 제출</Button>
                  </div>
                  {alreadyAssigned && <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">이미 역할을 배정받아 추가 입찰할 수 없습니다.</p>}
                </div>
              )}

              <div className="mt-5 rounded-3xl bg-yellow-50 p-4 text-sm font-medium text-slate-700">{displayMessage}</div>

              <div className="mt-5">
                <h3 className="mb-2 font-bold">현재 입찰 현황</h3>
                <div className="max-h-64 space-y-2 overflow-auto pr-1">
                  {sortedBids.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">아직 입찰이 없습니다.</p>
                  ) : (
                    sortedBids.map((bid, index) => (
                      <div key={`${bid.student}-${bid.createdAt}`} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <div>
                          <span className="font-bold">{index + 1}. {mode === "teacher" ? bid.student : maskName(bid.student)}</span>
                          {currentJob && index < currentJob.count && <Badge className="ml-2 rounded-full bg-emerald-500">선정권</Badge>}
                        </div>
                        <span className="font-black text-pink-500">{bid.amount}원</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[2rem] border-0 bg-white/90 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">배정 결과</h2>
              <Badge variant="outline" className="rounded-full">{winners.length}명 배정</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="px-3 py-2">역할</th>
                    <th className="px-3 py-2">학생</th>
                    <th className="px-3 py-2">제시 임금</th>
                    <th className="px-3 py-2">하는 일</th>
                    <th className="px-3 py-2">활동시기</th>
                  </tr>
                </thead>
                <tbody>
                  {winners.length === 0 ? (
                    <tr><td colSpan="5" className="rounded-2xl bg-slate-50 px-3 py-4 text-center text-slate-500">아직 배정 결과가 없습니다.</td></tr>
                  ) : (
                    [...winners].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((winner, index) => (
                      <tr key={`${winner.job}-${winner.student}-${index}`} className="bg-slate-50">
                        <td className="rounded-l-2xl px-3 py-3 font-bold">{winner.job}</td>
                        <td className="px-3 py-3">{mode === "teacher" ? winner.student : maskName(winner.student)}</td>
                        <td className="px-3 py-3 font-black text-pink-500">{winner.wage}원</td>
                        <td className="px-3 py-3">{winner.role}</td>
                        <td className="rounded-r-2xl px-3 py-3">{winner.timing}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function maskName(name = "") {
  if (name.length <= 1) return name;
  return `${name[0]}${"*".repeat(Math.max(1, name.length - 1))}`;
}
