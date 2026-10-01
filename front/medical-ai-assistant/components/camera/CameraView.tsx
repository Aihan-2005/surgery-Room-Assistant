"use client";


import {useEffect,useRef} from "react";


export default function CameraView(){


const videoRef =
useRef<HTMLVideoElement|null>(null);



useEffect(()=>{


async function startCamera(){


const stream =
await navigator.mediaDevices.getUserMedia({

video:{
 facingMode:"environment"
}

});



if(videoRef.current){

videoRef.current.srcObject=stream;

}


}



startCamera();



},[]);



return (

<video

ref={videoRef}

autoPlay

playsInline

className="
w-full
rounded-xl
"

/>

)

}