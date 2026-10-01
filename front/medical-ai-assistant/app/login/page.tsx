"use client";


import {useState} from "react";
import {useRouter} from "next/navigation";


export default function Login(){


const router = useRouter();


const [doctor,setDoctor]=useState("");



function login(){

if(doctor){

router.push("/dashboard");

}

}



return (

<div className="
min-h-screen
flex
items-center
justify-center
p-5
">


<div className="
w-full
max-w-sm
">


<h1 className="
text-2xl
font-bold
mb-5
">

Doctor Login

</h1>



<input

value={doctor}

onChange={
e=>setDoctor(e.target.value)
}

placeholder="Doctor ID"

className="
w-full
border
p-3
rounded-lg
"
/>



<button

onClick={login}

className="
mt-4
w-full
bg-blue-600
text-white
p-3
rounded-lg
"

>

Login

</button>


</div>


</div>

)

}