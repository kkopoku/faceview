"use client";

import { useEffect, useRef, MutableRefObject } from "react";
import io, { Socket } from "socket.io-client";

export default function Room({ params }: { params: { id: string } }) {
  const userVideo = useRef<HTMLVideoElement>(null);
  const partnerVideo = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const otherUser = useRef<string | null>(null);
  const userStream = useRef<MediaStream | null>(null);

  const uri = process.env.NEXT_PUBLIC_SERVER_URL;

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        if (userVideo.current) {
          userVideo.current.srcObject = stream;
        }

        userStream.current = stream;

        socketRef.current = io(`${uri}`);

        socketRef.current.emit("join room", params.id);
        console.log("Joining room:", params.id);

        socketRef.current.on("other user", (userID) => {
          console.log("Other user joined:", userID);
          callUser(userID);
          otherUser.current = userID;
        });

        socketRef.current.on("user joined", (userID) => {
          console.log("User joined:", userID);
          otherUser.current = userID;
        });

        socketRef.current.on("offer", handleRecieveCall);

        socketRef.current.on("answer", handleAnswer);

        socketRef.current.on("ice-candidate", handleNewICECandidateMsg);
      })
      .catch((e) => console.log(e));
  }, []);

  function callUser(userID: string) {
    console.log("Calling user:", userID);
    peerRef.current = createPeer(userID);
    userStream.current?.getTracks().forEach((track) => {
      console.log("Adding track to peer connection:", track);
      peerRef.current?.addTrack(track, userStream.current!);
    });
  }

  function createPeer(userID: string) {
    console.log("Creating peer connection for user:", userID);
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.stunprotocol.org",
        },
        {
          urls: "turn:numb.viagenie.ca",
          credential: "muazkh",
          username: "webrtc@live.com",
        },
      ],
    });

    peer.onicecandidate = handleICECandidateEvent;
    peer.ontrack = handleTrackEvent;
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

    return peer;
  }

  function handleNegotiationNeededEvent(userID: string) {
    console.log("Negotiation needed for user:", userID);

    peerRef.current
      ?.createOffer()
      .then((offer) => {
        console.log("Created offer:", offer);

        return peerRef.current?.setLocalDescription(offer);
      })
      .then(() => {
        const payload = {
          target: userID,
          caller: socketRef.current?.id,
          sdp: peerRef.current?.localDescription,
        };
        console.log("Sending offer payload:", payload);
        socketRef.current?.emit("offer", payload);
      })
      .catch((e) => console.log(e));
  }

  function handleRecieveCall(incoming: {
    sdp: RTCSessionDescriptionInit;
    caller: string;
  }) {
    console.log("Received call from:", incoming.caller);

    peerRef.current = createPeer(incoming.caller);
    const desc = new RTCSessionDescription(incoming.sdp);
    peerRef.current
      ?.setRemoteDescription(desc)
      .then(() => {
        userStream.current?.getTracks().forEach((track) => {
          console.log(
            "Adding track to peer connection after receiving call:",
            track
          );
          peerRef.current?.addTrack(track, userStream.current!);
        });
      })
      .then(() => {
        return peerRef.current?.createAnswer();
      })
      .then((answer) => {
        console.log("Created answer:", answer);
        return peerRef.current?.setLocalDescription(answer);
      })
      .then(() => {
        const payload = {
          target: incoming.caller,
          caller: socketRef.current?.id,
          sdp: peerRef.current?.localDescription,
        };
        console.log("Sending answer payload:", payload);
        socketRef.current?.emit("answer", payload);
      });
  }

  function handleAnswer(message: { sdp: RTCSessionDescriptionInit }) {
    console.log("Received answer:", message.sdp);
    const desc = new RTCSessionDescription(message.sdp);
    peerRef.current?.setRemoteDescription(desc).catch((e) => console.log(e));
  }

  function handleICECandidateEvent(e: RTCPeerConnectionIceEvent) {
    if (e.candidate) {
      console.log("Outgoing ICE candidate: ", e.candidate);
      const payload = {
        target: otherUser.current,
        candidate: e.candidate,
      };
      socketRef.current?.emit("ice-candidate", payload);
    }
  }

  function handleNewICECandidateMsg(incoming: RTCIceCandidateInit) {
    console.log("Incoming ICE candidate: ", incoming);
    const candidate = new RTCIceCandidate(incoming);
    peerRef.current?.addIceCandidate(candidate).catch((e) => console.log(e));
  }

  function handleTrackEvent(e: RTCTrackEvent) {
    console.log("Received remote track");
    if (partnerVideo.current) {
      partnerVideo.current.srcObject = e.streams[0];
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-gray-100">
      <video autoPlay ref={userVideo} className="w-1/2"></video>
      <video autoPlay ref={partnerVideo} className="w-1/2"></video>
    </div>
  );
}
