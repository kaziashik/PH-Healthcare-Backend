import bcrypt from "bcryptjs";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import config from "../config";

export const seedSuperAdmon = async () => {
  try {
    const isSuperAdmonExist = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
      },
    });

    if (isSuperAdmonExist) {
      await prisma.admin.upsert({
        where: { userId: isSuperAdmonExist.id },
        update: {},
        create: {
          name: isSuperAdmonExist.name,
          organizationEmail: isSuperAdmonExist.email,
          personalEmail: isSuperAdmonExist.email,
          userId: isSuperAdmonExist.id,
        },
      });
      console.log("Super Admin Exists!");
      return
    }

    const name = config.super_admin_name;
    const email = config.super_admin_email;
    const password = config.super_admin_password;

    if(!name || !email || !password){
        throw new Error ("super Admin Name, Email, Password missiong in Env File!!")
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        needPasswordChange: false,
        emailVerified: true,
        admin: {
          create: {
            name,
            organizationEmail: email,
            personalEmail: email,
          },
        },
      },
    });

    console.log("super admin Created: ", superAdmin);
  } catch (error) {
    console.log("Error seeding super Admin: ", error);

    await prisma.user.delete({
        where: {
            email: config.super_admin_email
        }
    })
  }
};




//create tester admin 

export const seedTesterAdmin = async () => {
    try {
        const isTesterAdminExist = await prisma.user.findUnique({
            where: {
                email : config.tester_admin_email
            }
        });

        if (isTesterAdminExist) {
            await prisma.admin.upsert({
                where: { userId: isTesterAdminExist.id },
                update: {},
                create: {
                    name: isTesterAdminExist.name,
                    organizationEmail: isTesterAdminExist.email,
                    personalEmail: isTesterAdminExist.email,
                    userId: isTesterAdminExist.id,
                },
            });
            console.log("Tester Admin Already Exists!");
            return;
        }

        const name = config.tester_admin_name
        const email = config.tester_admin_email
        const password = config.tester_admin_password

        if (!name || !email || !password) {
            throw new Error("Tester Admin Name , Email, Password Missing In Env File!!!")
        }

        const hashedPassword = await bcrypt.hash(password, Number(config.bcrypt_salt_rounds))

        const testerAdmin = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: Role.ADMIN,
                needPasswordChange: false,
                emailVerified: true,
                admin: {
                    create: {
                        name,
                        organizationEmail: email,
                        personalEmail: email,
                    },
                },
            }
        })

        console.log("Tester Admin Created : ", testerAdmin);



    } catch (error) {

        console.log("Error Seeding Tester Admin : ", error);

        await prisma.user.delete({
            where: {
                email: config.tester_admin_email
            }
        })


    }
}


// create tester doctor

export const seedTesterDoctor = async () => {
    try {
        const isTesterDoctorExist = await prisma.user.findUnique({
            where: {
                email : config.tester_doctor_email
            }
        });

        if (isTesterDoctorExist) {
            const envPassword = config.tester_doctor_password;
            if (envPassword && isTesterDoctorExist.password) {
                const passwordMatches = await bcrypt.compare(
                    envPassword,
                    isTesterDoctorExist.password,
                );

                if (!passwordMatches) {
                    await prisma.user.update({
                        where: { id: isTesterDoctorExist.id },
                        data: {
                            password: await bcrypt.hash(
                                envPassword,
                                Number(config.bcrypt_salt_rounds) || 8,
                            ),
                        },
                    });
                    console.log("Tester Doctor password synced from env");
                }
            }

            const doctorProfile = await prisma.doctor.findUnique({
                where: { userId: isTesterDoctorExist.id },
            });

            if (!doctorProfile) {
                await prisma.doctor.create({
                    data: {
                        name: isTesterDoctorExist.name,
                        email: isTesterDoctorExist.email,
                        specialization: "General Medicine",
                        licenseNumber: "SEED-TEST-DOCTOR",
                        qualifications: "MBBS",
                        experienceYears: 1,
                        verificationStatus: DoctorVerificationStatus.APPROVED,
                        userId: isTesterDoctorExist.id,
                    },
                });
            }

            console.log("Tester Doctor Already Exists!");
            return;
        }

        const name = config.tester_doctor_name
        const email = config.tester_doctor_email
        const password = config.tester_doctor_password

        if (!name || !email || !password) {
            throw new Error("Tester Doctor Name , Email, Password Missing In Env File!!!")
        }

        const hashedPassword = await bcrypt.hash(password, Number(config.bcrypt_salt_rounds))

        const testerDoctor = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: Role.DOCTOR,
                needPasswordChange: false,
                emailVerified: true,
                doctor: {
                    create: {
                        name,
                        email,
                        specialization: "General Medicine",
                        licenseNumber: "SEED-TEST-DOCTOR",
                        qualifications: "MBBS",
                        experienceYears: 1,
                        verificationStatus: DoctorVerificationStatus.APPROVED,
                    },
                },
            }
        })

        console.log("Tester Doctor Created : ",testerDoctor);



    } catch (error) {

        console.log("Error Seeding Tester Doctor : ", error);

        await prisma.user.delete({
            where: {
                email: config.tester_doctor_email
            }
        })


    }
}

const rosterDoctors = [
  {
    name: "Dr. Farhana Rahman",
    email: "farhana.rahman@phhealthcare.demo",
    specialization: "Cardiology",
    qualifications: "MBBS, FCPS (Cardiology)",
    experienceYears: 12,
    consultationFee: 1200,
    licenseNumber: "BMDC-44821",
    contactNumber: "01711001001",
    address: "Square Hospital, Panthapath, Dhaka",
    bio: "Treats chest pain, blood pressure, and heart rhythm problems.",
  },
  {
    name: "Dr. Tanvir Hasan",
    email: "tanvir.hasan@phhealthcare.demo",
    specialization: "Orthopedics",
    qualifications: "MBBS, MS (Orthopedics)",
    experienceYears: 9,
    consultationFee: 900,
    licenseNumber: "BMDC-45102",
    contactNumber: "01711001002",
    address: "National Institute of Traumatology, Dhaka",
    bio: "Sees fractures, joint pain, and sports injuries.",
  },
  {
    name: "Dr. Nusrat Jahan",
    email: "nusrat.jahan@phhealthcare.demo",
    specialization: "Pediatrics",
    qualifications: "MBBS, DCH",
    experienceYears: 8,
    consultationFee: 700,
    licenseNumber: "BMDC-46218",
    contactNumber: "01711001003",
    address: "Dhaka Shishu Hospital, Sher-e-Bangla Nagar",
    bio: "Cares for infants and children, including fever and growth concerns.",
  },
  {
    name: "Dr. Nabila Karim",
    email: "nabila.karim@phhealthcare.demo",
    specialization: "Dermatology",
    qualifications: "MBBS, DDV",
    experienceYears: 6,
    consultationFee: 800,
    licenseNumber: "BMDC-47055",
    contactNumber: "01711001004",
    address: "LabAid Specialized Hospital, Dhanmondi",
    bio: "Treats rashes, acne, and other skin conditions for women and families.",
  },
  {
    name: "Dr. Sadia Ahmed",
    email: "sadia.ahmed@phhealthcare.demo",
    specialization: "Gynecology",
    qualifications: "MBBS, FCPS (Obstetrics and Gynecology)",
    experienceYears: 15,
    consultationFee: 1100,
    licenseNumber: "BMDC-43390",
    contactNumber: "01711001005",
    address: "Bangabandhu Sheikh Mujib Medical University, Dhaka",
    bio: "Consults on pregnancy, menstrual problems, and women's health.",
  },
  {
    name: "Dr. Rafiqul Islam",
    email: "rafiqul.islam@phhealthcare.demo",
    specialization: "Neurology",
    qualifications: "MBBS, MD (Neurology)",
    experienceYears: 14,
    consultationFee: 1300,
    licenseNumber: "BMDC-42811",
    contactNumber: "01711001006",
    address: "Ibn Sina Hospital, Dhanmondi, Dhaka",
    bio: "Sees headache, stroke follow-up, and nerve disorders.",
  },
  {
    name: "Dr. Mehzabin Chowdhury",
    email: "mehzabin.chowdhury@phhealthcare.demo",
    specialization: "Ophthalmology",
    qualifications: "MBBS, FCPS (Eye)",
    experienceYears: 11,
    consultationFee: 750,
    licenseNumber: "BMDC-45570",
    contactNumber: "01711001007",
    address: "Ispahani Islamia Eye Institute, Farmgate, Dhaka",
    bio: "Checks vision problems, cataracts, and eye infections.",
  },
  {
    name: "Dr. Arif Mahmud",
    email: "arif.mahmud@phhealthcare.demo",
    specialization: "ENT",
    qualifications: "MBBS, MS (ENT)",
    experienceYears: 7,
    consultationFee: 650,
    licenseNumber: "BMDC-48133",
    contactNumber: "01711001008",
    address: "Popular Diagnostic Centre, Shyamoli, Dhaka",
    bio: "Treats ear, nose, throat, and sinus problems.",
  },
  {
    name: "Dr. Lamia Sultana",
    email: "lamia.sultana@phhealthcare.demo",
    specialization: "Psychiatry",
    qualifications: "MBBS, MPhil (Psychiatry)",
    experienceYears: 5,
    consultationFee: 850,
    licenseNumber: "BMDC-49004",
    contactNumber: "01711001009",
    address: "National Institute of Mental Health, Dhaka",
    bio: "Consults on anxiety, depression, and sleep problems.",
  },
  {
    name: "Dr. Rukaiya Haque",
    email: "rukaiya.haque@phhealthcare.demo",
    specialization: "General Medicine",
    qualifications: "MBBS, FCPS (Medicine)",
    experienceYears: 10,
    consultationFee: 600,
    licenseNumber: "BMDC-44602",
    contactNumber: "01711001010",
    address: "Dhaka Medical College Hospital, Dhaka",
    bio: "Sees fever, diabetes, and other general medical problems.",
  },
] as const;

const portraitByLicense: Record<string, string> = {
  "BMDC-44821": "/doctors/farhana.jpg",
  "BMDC-45102": "/doctors/tanvir.jpg",
  "BMDC-46218": "/doctors/nusrat.jpg",
  "BMDC-47055": "/doctors/nabila.jpg",
  "BMDC-43390": "/doctors/sadia.jpg",
  "BMDC-42811": "/doctors/rafiqul.jpg",
  "BMDC-45570": "/doctors/mehzabin.jpg",
  "BMDC-48133": "/doctors/arif.jpg",
  "BMDC-49004": "/doctors/lamia.jpg",
  "BMDC-44602": "/doctors/rukaiya.jpg",
};

export const seedRosterDoctors = async () => {
  const password = config.tester_doctor_password;
  if (!password) {
    console.log("Roster doctors skipped: tester doctor password is missing");
    return;
  }

  const hashedPassword = await bcrypt.hash(
    password,
    Number(config.bcrypt_salt_rounds) || 8,
  );

  for (const doctor of rosterDoctors) {
    const imageUrl = portraitByLicense[doctor.licenseNumber] ?? "";
    const existingProfile = await prisma.doctor.findUnique({
      where: { licenseNumber: doctor.licenseNumber },
    });

    if (existingProfile) {
      await prisma.user.update({
        where: { id: existingProfile.userId },
        data: {
          name: doctor.name,
          email: doctor.email,
          imageUrl,
          doctor: {
            update: {
              name: doctor.name,
              email: doctor.email,
              bio: doctor.bio,
              specialization: doctor.specialization,
              qualifications: doctor.qualifications,
            },
          },
        },
      });
      continue;
    }

    await prisma.user.create({
      data: {
        name: doctor.name,
        email: doctor.email,
        password: hashedPassword,
        role: Role.DOCTOR,
        needPasswordChange: false,
        emailVerified: true,
        imageUrl,
        doctor: {
          create: {
            name: doctor.name,
            email: doctor.email,
            specialization: doctor.specialization,
            qualifications: doctor.qualifications,
            experienceYears: doctor.experienceYears,
            consultationFee: doctor.consultationFee,
            licenseNumber: doctor.licenseNumber,
            contactNumber: doctor.contactNumber,
            address: doctor.address,
            bio: doctor.bio,
            verificationStatus: DoctorVerificationStatus.APPROVED,
          },
        },
      },
    });
  }

  console.log("Roster doctors ready");
};
